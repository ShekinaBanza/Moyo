<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** User A must never read, change, delete or sync anything that belongs to user B. */
class IsolationTest extends TestCase
{
    use RefreshDatabase;

    private User $a;

    private User $b;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = User::factory()->create();
        $this->b = User::factory()->create();
    }

    private function createAs(User $u, string $uri, array $payload): int
    {
        Sanctum::actingAs($u);

        return $this->postJson("/api/v1/$uri", $payload)->assertCreated()->json('data.id');
    }

    private function samples(): array
    {
        $now = now()->subHour()->toIso8601String();

        return [
            'sleep-records' => ['night_date' => now()->toDateString(), 'bedtime' => now()->subHours(9)->toIso8601String(), 'wake_time' => now()->subHour()->toIso8601String()],
            'food-entries' => ['name' => 'Foufou', 'meal_type' => 'lunch', 'eaten_at' => $now],
            'symptoms' => ['symptom_type' => 'fatigue', 'occurred_at' => $now, 'intensity' => 3],
            'body-measurements' => ['kind' => 'weight', 'value' => 70, 'measured_at' => $now],
            'activity-entries' => ['activity_type' => 'walking', 'started_at' => $now, 'duration_minutes' => 20],
            'habits' => ['habit' => 'water', 'day' => now()->toDateString(), 'done' => true],
        ];
    }

    public function test_user_cannot_read_list_modify_or_delete_another_users_entries(): void
    {
        foreach ($this->samples() as $uri => $payload) {
            $id = $this->createAs($this->b, $uri, $payload);

            Sanctum::actingAs($this->a);
            $this->getJson("/api/v1/$uri")->assertOk()->assertJsonCount(0, 'data');
            $this->getJson("/api/v1/$uri/$id")->assertNotFound();
            $this->patchJson("/api/v1/$uri/$id", ['notes' => 'hack'])->assertNotFound();
            $this->deleteJson("/api/v1/$uri/$id")->assertNotFound();

            Sanctum::actingAs($this->b);
            $this->getJson("/api/v1/$uri/$id")->assertOk(); // still there and intact for B
        }
    }

    public function test_user_id_in_body_is_ignored(): void
    {
        Sanctum::actingAs($this->a);
        $payload = $this->samples()['food-entries'] + ['user_id' => $this->b->id];
        $id = $this->postJson('/api/v1/food-entries', $payload)->assertCreated()->json('data.id');

        $this->assertDatabaseHas('food_entries', ['id' => $id, 'user_id' => $this->a->id]);
    }

    public function test_user_cannot_see_or_use_another_users_device(): void
    {
        $deviceId = $this->createAs($this->b, 'devices', ['name' => 'Watch8']);

        Sanctum::actingAs($this->a);
        $this->getJson('/api/v1/devices')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/devices/$deviceId/capabilities")->assertNotFound();
        $this->patchJson("/api/v1/devices/$deviceId", ['name' => 'x'])->assertNotFound();
        $this->deleteJson("/api/v1/devices/$deviceId")->assertNotFound();
    }

    public function test_user_cannot_sync_measurements_on_behalf_of_another_users_device(): void
    {
        $deviceId = $this->createAs($this->b, 'devices', ['name' => 'Watch8']);

        Sanctum::actingAs($this->a);
        $this->postJson('/api/v1/measurements/sync', [
            'device_id' => $deviceId,
            'measurements' => [['client_id' => 'c1', 'measurement_type' => 'heart_rate', 'value_numeric' => 70, 'unit' => 'bpm', 'source_type' => 'watch', 'measured_at' => now()->subMinute()->toIso8601String()]],
        ])->assertUnprocessable();

        $this->assertDatabaseCount('health_measurements', 0);
    }

    public function test_synced_measurements_belong_to_the_authenticated_user_and_are_private(): void
    {
        Sanctum::actingAs($this->b);
        $this->postJson('/api/v1/measurements/sync', [
            'measurements' => [['client_id' => 'b1', 'measurement_type' => 'spo2', 'value_numeric' => 97, 'unit' => '%', 'source_type' => 'manual', 'measured_at' => now()->subMinute()->toIso8601String(), 'user_id' => $this->a->id]],
        ])->assertOk();
        $this->assertDatabaseHas('health_measurements', ['client_id' => 'b1', 'user_id' => $this->b->id]);

        Sanctum::actingAs($this->a);
        $this->getJson('/api/v1/measurements')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_dashboard_and_exports_only_contain_own_data(): void
    {
        $this->createAs($this->b, 'symptoms', $this->samples()['symptoms']);

        Sanctum::actingAs($this->a);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonCount(0, 'data.recent_symptoms');
        $this->postJson('/api/v1/account/export')->assertOk()->assertJsonCount(0, 'symptoms');
    }

    public function test_private_routes_reject_guests(): void
    {
        foreach (['me', 'dashboard', 'sleep-records', 'food-entries', 'symptoms', 'body-measurements', 'activity-entries', 'devices', 'measurements', 'safety-status', 'consents'] as $uri) {
            $this->getJson("/api/v1/$uri")->assertUnauthorized();
        }
        $this->postJson('/api/v1/measurements/sync', [])->assertUnauthorized();
        $this->deleteJson('/api/v1/account')->assertUnauthorized();
    }
}

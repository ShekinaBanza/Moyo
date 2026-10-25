<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ActivityCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The watch is optional: nothing may depend on it, and nothing coming from it is invented or trusted by default. */
class WatchTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ActivityCatalogSeeder::class);
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    private function device(string $identifier = 'AA:BB:CC'): int
    {
        return $this->postJson('/api/v1/devices', ['name' => 'Watch8', 'model' => 'Remax Watch8', 'identifier' => $identifier])->json('data.id');
    }

    private function hr(string $cid, int $bpm, string $source = 'watch', ?string $at = null): array
    {
        return ['client_id' => $cid, 'measurement_type' => 'heart_rate', 'value_numeric' => $bpm, 'unit' => 'bpm', 'source_type' => $source, 'measured_at' => $at ?? now()->subMinute()->toIso8601String(), 'decoder_version' => $source === 'watch' ? 'gatt-hrs-1' : null];
    }

    public function test_everything_works_without_any_watch(): void
    {
        foreach (['me', 'dashboard', 'safety-status', 'devices', 'measurements', 'energy/daily', 'day', 'trends', 'sleep-records', 'food-entries', 'activity-entries', 'symptoms', 'body-measurements', 'tracks', 'notifications', 'exercises', 'workout-programs', 'consents'] as $u) {
            $this->getJson("/api/v1/$u")->assertOk();
        }
        $this->getJson('/api/v1/dashboard')->assertJsonPath('data.device', null)->assertJsonPath('data.last_measurement', null);
        $this->postJson('/api/v1/food-entries', ['name' => 'Riz', 'meal_type' => 'lunch', 'eaten_at' => now()->subHour()->toIso8601String()])->assertCreated();
    }

    public function test_association_is_idempotent_and_starts_unverified_never_connected(): void
    {
        $a = $this->postJson('/api/v1/devices', ['name' => 'Watch8', 'identifier' => 'AA:BB:CC'])->assertCreated()
            ->assertJsonPath('data.integration_status', 'unverified')->assertJsonPath('data.connection_status', 'paired');
        $b = $this->postJson('/api/v1/devices', ['name' => 'Watch8', 'identifier' => 'AA:BB:CC'])->assertOk()->assertJsonPath('existing', true);
        $this->assertSame($a->json('data.id'), $b->json('data.id'));
        $this->assertDatabaseCount('wearable_devices', 1);
    }

    public function test_connection_status_can_be_updated_to_reflect_a_lost_connection(): void
    {
        $id = $this->device();
        foreach (['connected', 'error', 'disconnected'] as $s) {
            $this->patchJson("/api/v1/devices/$id", ['connection_status' => $s])->assertOk()->assertJsonPath('data.connection_status', $s);
        }
        $this->patchJson("/api/v1/devices/$id", ['connection_status' => 'synchronised-ok'])->assertUnprocessable();
    }

    public function test_a_capability_is_only_confirmed_with_a_decoder_version_and_known_type(): void
    {
        $id = $this->device();
        $this->postJson("/api/v1/devices/$id/capabilities", ['measurement_type' => 'heart_rate', 'confirmed' => true])->assertUnprocessable();
        $this->postJson("/api/v1/devices/$id/capabilities", ['measurement_type' => 'sleep_stages', 'confirmed' => true, 'decoder_version' => 'x'])->assertUnprocessable(); // unknown data type
        $this->getJson("/api/v1/devices/$id/capabilities")->assertJsonPath('integration_status', 'unverified')->assertJsonCount(0, 'data');

        $this->postJson("/api/v1/devices/$id/capabilities", ['measurement_type' => 'heart_rate', 'confirmed' => true, 'decoder_version' => 'gatt-hrs-1'])->assertOk()->assertJsonPath('integration_status', 'partial');
        $r = $this->getJson("/api/v1/devices/$id/capabilities")->assertOk();
        $r->assertJsonCount(1, 'data')->assertJsonPath('data.0.confirmed', true);
        $this->assertStringContainsString('partielle', $r->json('note'));

        $this->postJson("/api/v1/devices/$id/capabilities", ['measurement_type' => 'heart_rate', 'confirmed' => false])->assertOk()->assertJsonPath('integration_status', 'unverified');
        $this->assertDatabaseCount('wearable_capabilities', 1); // upsert, no duplicate
    }

    public function test_capabilities_of_another_users_device_are_inaccessible(): void
    {
        $id = $this->device();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/v1/devices/$id/capabilities", ['measurement_type' => 'heart_rate', 'confirmed' => true, 'decoder_version' => 'x'])->assertNotFound();
        $this->getJson("/api/v1/devices/$id/capabilities")->assertNotFound();
        $this->assertDatabaseCount('wearable_capabilities', 0);
    }

    public function test_repeated_sync_creates_no_duplicates_and_records_each_attempt(): void
    {
        $id = $this->device();
        $payload = ['device_id' => $id, 'measurements' => [$this->hr('d1:hr:1', 70), $this->hr('d1:hr:2', 72)]];
        $this->postJson('/api/v1/measurements/sync', $payload)->assertOk()->assertJsonPath('data.accepted', 2);
        $again = $this->postJson('/api/v1/measurements/sync', $payload)->assertOk();
        $this->assertSame(2, $again->json('data.duplicates'));
        $this->assertSame(0, $again->json('data.accepted'));
        $this->assertDatabaseCount('health_measurements', 2);
        $this->getJson('/api/v1/sync-operations')->assertJsonCount(2, 'data');
        $this->assertNotNull(\App\Models\WearableDevice::find($id)->last_sync_at);
    }

    public function test_unknown_data_is_rejected_not_stored_as_a_value(): void
    {
        $id = $this->device();
        $bad = ['client_id' => 'u1', 'measurement_type' => 'spo2', 'value_numeric' => null, 'unit' => '%', 'source_type' => 'watch', 'measured_at' => now()->subMinute()->toIso8601String()];
        $r = $this->postJson('/api/v1/measurements/sync', ['device_id' => $id, 'measurements' => [$bad, $this->hr('u2', 400), array_merge($this->hr('u3', 70), ['measurement_type' => 'hrv'])]])->assertOk();
        $this->assertSame(0, $r->json('data.accepted'));
        $this->assertSame(3, $r->json('data.rejected'));
        $this->assertSame('failed', $r->json('data.status'));
        $this->assertDatabaseCount('health_measurements', 0);
        $this->postJson('/api/v1/measurements/sync', ['measurements' => [array_merge($this->hr('u4', 70), ['measurement_type' => 'calories_burned'])]])->assertUnprocessable(); // type not supported at all
    }

    public function test_values_from_several_sources_keep_their_provenance_and_are_never_auto_verified(): void
    {
        $id = $this->device();
        $at = now()->subMinutes(2)->toIso8601String();
        $this->postJson('/api/v1/measurements/sync', ['device_id' => $id, 'measurements' => [$this->hr('m1', 68, 'manual', $at), $this->hr('w1', 71, 'watch', $at), $this->hr('i1', 70, 'imported', $at)]])->assertOk()->assertJsonPath('data.accepted', 3);
        $rows = collect($this->getJson('/api/v1/measurements?type=heart_rate')->json('data'))->keyBy('source_type');
        $this->assertCount(3, $rows);
        $this->assertSame('verified', $rows['manual']['quality_status']); // typed by the user
        $this->assertSame('unverified', $rows['watch']['quality_status']); // Bluetooth is never "verified" by itself
        $this->assertSame('unverified', $rows['imported']['quality_status']);
        $this->assertSame('gatt-hrs-1', $rows['watch']['decoder_version']);
        $this->assertNotNull($rows['watch']['received_at']);
        $this->assertNotEquals($rows['watch']['received_at'], $rows['watch']['measured_at']); // measurement date != reception date
        $this->assertNull($rows['manual']['device_id']);
        $this->assertSame($id, $rows['watch']['device_id']);
    }

    public function test_old_watch_data_is_marked_stale_and_future_data_rejected(): void
    {
        $id = $this->device();
        $r = $this->postJson('/api/v1/measurements/sync', ['device_id' => $id, 'measurements' => [$this->hr('o1', 70, 'watch', now()->subDays(3)->toIso8601String()), $this->hr('f1', 70, 'watch', now()->addHour()->toIso8601String())]])->assertOk();
        $this->assertSame(1, $r->json('data.accepted'));
        $this->assertSame(1, $r->json('data.rejected'));
        $this->assertDatabaseHas('health_measurements', ['client_id' => 'o1', 'quality_status' => 'stale']);
    }

    public function test_watch_values_never_change_the_energy_balance_or_the_safety_decision(): void
    {
        $id = $this->device();
        $day = now()->toDateString();
        $before = $this->getJson("/api/v1/energy/daily?date=$day")->json('data');
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'breathlessness', 'occurred_at' => now()->subDay()->toIso8601String(), 'intensity' => 4])->assertCreated();
        $this->postJson('/api/v1/measurements/sync', ['device_id' => $id, 'measurements' => [$this->hr('e1', 60), ['client_id' => 'e2', 'measurement_type' => 'spo2', 'value_numeric' => 99, 'unit' => '%', 'source_type' => 'watch', 'measured_at' => now()->subMinute()->toIso8601String()]]])->assertOk();

        $after = $this->getJson("/api/v1/energy/daily?date=$day")->json('data');
        $this->assertSame($before['expenditure'], $after['expenditure']);
        $this->assertSame($before['balance']['kcal'], $after['balance']['kcal']);
        $this->assertFalse($after['watch_energy']['used']);
        $this->assertSame('caution', $this->getJson('/api/v1/safety-status')->json('data.level')); // "all fine" from the watch does not cancel a declared symptom
        $this->getJson('/api/v1/exercises/access')->assertJsonPath('data.mode', 'restricted');
    }

    public function test_dashboard_shows_the_source_and_dates_of_the_last_watch_measurement(): void
    {
        $id = $this->device();
        $this->postJson('/api/v1/measurements/sync', ['device_id' => $id, 'measurements' => [$this->hr('x1', 74)]])->assertOk();
        $d = $this->getJson('/api/v1/dashboard')->json('data');
        $this->assertSame('watch', $d['last_measurement']['source_type']);
        $this->assertSame('unverified', $d['last_measurement']['quality_status']);
        $this->assertSame('paired', $d['device']['connection_status']); // not "connected": no connection claim without a real one
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FeaturesTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        $u = User::factory()->create();
        Sanctum::actingAs($u);

        return $u;
    }

    public function test_sleep_crossing_midnight_gets_correct_durations(): void
    {
        $this->user();
        $r = $this->postJson('/api/v1/sleep-records', [
            'night_date' => '2026-10-24',
            'bedtime' => '2026-10-24T23:30:00+01:00',
            'sleep_onset_at' => '2026-10-25T00:00:00+01:00',
            'wake_time' => '2026-10-25T06:30:00+01:00',
            'awake_minutes' => 30,
        ])->assertCreated();

        $this->assertSame(420, $r->json('data.time_in_bed_minutes'));
        $this->assertSame(360, $r->json('data.sleep_minutes')); // 6h30 from onset - 30 min awake
    }

    public function test_sleep_rejects_wake_before_bedtime(): void
    {
        $this->user();
        $this->postJson('/api/v1/sleep-records', [
            'night_date' => '2026-10-24', 'bedtime' => '2026-10-25T06:00:00+01:00', 'wake_time' => '2026-10-25T05:00:00+01:00',
        ])->assertUnprocessable();
    }

    public function test_food_entry_crud_and_no_calories_without_a_basis(): void
    {
        $this->user();
        $id = $this->postJson('/api/v1/food-entries', [
            'name' => 'Riz et haricots', 'meal_type' => 'lunch', 'eaten_at' => now()->subHour()->toIso8601String(),
            'unit' => 'medium', 'quantity' => 1, 'kcal' => 650,
        ])->assertCreated()->assertJsonPath('data.kcal', null)->assertJsonPath('data.nutrition_status', 'unknown')->json('data.id');

        $this->patchJson("/api/v1/food-entries/$id", ['nutrition_status' => 'estimated', 'kcal' => 600])->assertOk()->assertJsonPath('data.kcal', 600);
        $this->patchJson("/api/v1/food-entries/$id", ['name' => 'Riz'])->assertOk()->assertJsonPath('data.name', 'Riz');
        $this->deleteJson("/api/v1/food-entries/$id")->assertOk();
        $this->getJson('/api/v1/food-entries')->assertJsonCount(0, 'data');
    }

    public function test_invalid_data_is_rejected(): void
    {
        $this->user();
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 900, 'measured_at' => now()->toIso8601String()])->assertUnprocessable();
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'fatigue', 'occurred_at' => now()->toIso8601String(), 'intensity' => 11])->assertUnprocessable();
        $this->postJson('/api/v1/food-entries', ['name' => '', 'meal_type' => 'x'])->assertUnprocessable();
    }

    public function test_client_id_makes_creation_idempotent(): void
    {
        $this->user();
        $payload = ['client_id' => 'abc-1', 'kind' => 'weight', 'value' => 70.5, 'measured_at' => now()->subMinute()->toIso8601String()];
        $this->postJson('/api/v1/body-measurements', $payload)->assertCreated();
        $this->postJson('/api/v1/body-measurements', $payload)->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseCount('body_measurements', 1);
    }

    public function test_dashboard_shows_unavailable_instead_of_zero_for_new_user(): void
    {
        $this->user();
        $r = $this->getJson('/api/v1/dashboard')->assertOk();
        $this->assertNull($r->json('data.sleep'));
        $this->assertNull($r->json('data.activity_today.steps'));
        $this->assertNull($r->json('data.weight'));
        $this->assertNull($r->json('data.device'));
        $this->assertSame('none', $r->json('data.safety.level'));
    }

    public function test_safety_emergency_for_chest_pain_and_blocks_progression(): void
    {
        $this->user();
        $r = $this->postJson('/api/v1/symptoms', ['symptom_type' => 'chest_pain', 'occurred_at' => now()->subMinutes(5)->toIso8601String(), 'intensity' => 5])->assertCreated();
        $this->assertSame('emergency', $r->json('safety.level'));
        $this->assertFalse($r->json('safety.activity_progression_allowed'));
    }

    public function test_safety_breathlessness_plus_swelling_recommends_prompt_evaluation(): void
    {
        $this->user();
        $t = now()->subDay()->subHours(2)->toIso8601String();
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'breathlessness', 'occurred_at' => $t, 'intensity' => 4, 'at_rest' => false])->assertCreated();
        $r = $this->postJson('/api/v1/symptoms', ['symptom_type' => 'swelling', 'occurred_at' => $t, 'intensity' => 3])->assertCreated();
        $this->assertSame('prompt_evaluation', $r->json('safety.level'));
        $this->assertFalse($r->json('safety.activity_progression_allowed'));
    }

    public function test_watch_data_cannot_cancel_declared_symptoms(): void
    {
        $this->user();
        $t = now()->subDays(2)->toIso8601String();
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'breathlessness', 'occurred_at' => $t, 'intensity' => 4])->assertCreated();
        $this->postJson('/api/v1/measurements/sync', ['measurements' => [
            ['client_id' => 'h1', 'measurement_type' => 'spo2', 'value_numeric' => 99, 'unit' => '%', 'source_type' => 'imported', 'measured_at' => now()->subMinute()->toIso8601String()],
        ]])->assertOk();
        $r = $this->getJson('/api/v1/safety-status')->assertOk();
        $this->assertSame('caution', $r->json('data.level'));
        $this->assertFalse($r->json('data.activity_progression_allowed'));
    }

    public function test_sync_is_idempotent_rejects_implausible_values_and_never_auto_verifies_watch_data(): void
    {
        $u = $this->user();
        $devId = $this->postJson('/api/v1/devices', ['name' => 'Watch8', 'model' => 'Remax Watch8'])->assertCreated()->assertJsonPath('data.integration_status', 'unverified')->json('data.id');
        $payload = ['device_id' => $devId, 'measurements' => [
            ['client_id' => 'w1', 'measurement_type' => 'heart_rate', 'value_numeric' => 72, 'unit' => 'bpm', 'source_type' => 'watch', 'measured_at' => now()->subMinutes(2)->toIso8601String(), 'decoder_version' => 'dev-0'],
            ['client_id' => 'w2', 'measurement_type' => 'heart_rate', 'value_numeric' => 400, 'unit' => 'bpm', 'source_type' => 'watch', 'measured_at' => now()->subMinutes(2)->toIso8601String()],
            ['client_id' => 'w3', 'measurement_type' => 'heart_rate', 'value_numeric' => 70, 'unit' => 'bpm', 'source_type' => 'watch', 'measured_at' => now()->subDays(3)->toIso8601String()],
        ]];
        $first = $this->postJson('/api/v1/measurements/sync', $payload)->assertOk();
        $this->assertSame(2, $first->json('data.accepted'));
        $this->assertSame(1, $first->json('data.rejected'));
        $this->assertSame('partial', $first->json('data.status'));

        $second = $this->postJson('/api/v1/measurements/sync', $payload)->assertOk();
        $this->assertSame(2, $second->json('data.duplicates'));
        $this->assertDatabaseCount('health_measurements', 2);
        $this->assertDatabaseHas('health_measurements', ['client_id' => 'w1', 'quality_status' => 'unverified']);
        $this->assertDatabaseHas('health_measurements', ['client_id' => 'w3', 'quality_status' => 'stale']);
        $this->assertDatabaseMissing('health_measurements', ['quality_status' => 'verified']);
        $this->getJson("/api/v1/devices/$devId/capabilities")->assertOk()->assertJsonPath('integration_status', 'unverified');
    }

    public function test_trends_use_recorded_data_only(): void
    {
        $this->user();
        $this->getJson('/api/v1/trends?range=week')->assertOk()->assertJsonCount(0, 'data.sleep')->assertJsonCount(0, 'data.weight');
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 71, 'measured_at' => now()->subDay()->toIso8601String()])->assertCreated();
        $this->getJson('/api/v1/trends?range=week')->assertJsonCount(1, 'data.weight');
    }

    public function test_consents_profile_export_and_account_deletion(): void
    {
        $u = $this->user();
        $this->postJson('/api/v1/consents', ['purpose' => 'wearable_sync', 'granted' => true])->assertCreated();
        $this->getJson('/api/v1/consents')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson('/api/v1/profile', ['height_cm' => 170, 'evaluated_by_professional' => false])->assertOk()->assertJsonPath('data.profile.height_cm', 170);
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 70, 'measured_at' => now()->subMinute()->toIso8601String()])->assertCreated();

        $this->postJson('/api/v1/account/export')->assertOk()->assertJsonCount(1, 'body_measurements')->assertJsonMissing(['password' => $u->password]);

        $this->deleteJson('/api/v1/account', ['password' => 'wrong', 'confirmation' => 'SUPPRIMER'])->assertUnprocessable();
        $this->deleteJson('/api/v1/account', ['password' => 'password', 'confirmation' => 'SUPPRIMER'])->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $u->id]);
        $this->assertDatabaseCount('body_measurements', 0);
    }

    public function test_dates_with_an_offset_are_stored_as_the_real_instant_in_utc(): void
    {
        $u = $this->user();
        $id = $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 70, 'measured_at' => '2026-10-24T23:30:00+01:00'])->assertCreated()->json('data.id');
        $this->assertSame('2026-10-24 22:30:00', \Illuminate\Support\Facades\DB::table('body_measurements')->where('id', $id)->value('measured_at'));
        $this->getJson("/api/v1/body-measurements/$id")->assertJsonPath('data.measured_at', '2026-10-24T22:30:00.000000Z');

        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 71, 'measured_at' => '2026-10-24T22:30:00Z', 'client_id' => 'tz2'])->assertCreated();
        $this->assertSame(2, \Illuminate\Support\Facades\DB::table('body_measurements')->where('measured_at', '2026-10-24 22:30:00')->count());
    }
}

<?php

namespace Tests\Feature;

use App\Models\ActivityCatalogItem;
use App\Models\HealthProfile;
use App\Models\User;
use Database\Seeders\ActivityCatalogSeeder;
use Database\Seeders\FoodCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnergyTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private string $day = '2026-10-20';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ActivityCatalogSeeder::class);
        $this->seed(FoodCatalogSeeder::class);
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    private function completeProfile(): void
    {
        HealthProfile::unguarded(fn () => HealthProfile::updateOrCreate(['user_id' => $this->user->id], ['sex' => 'female', 'birth_date' => '1996-10-20', 'height_cm' => 165, 'timezone' => 'UTC']));
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 60, 'measured_at' => '2026-10-19T08:00:00Z'])->assertCreated();
    }

    private function catalog(string $slug): int
    {
        return ActivityCatalogItem::where('slug', $slug)->value('id');
    }

    private function walk(int $minutes = 60, array $extra = []): array
    {
        return $this->postJson('/api/v1/activity-entries', array_merge(['catalog_id' => $this->catalog('marche-normale'), 'started_at' => "{$this->day}T10:00:00Z", 'duration_minutes' => $minutes], $extra))->assertCreated()->json('data');
    }

    private function meal(array $extra = []): array
    {
        return $this->postJson('/api/v1/food-entries', array_merge(['name' => 'Riz', 'meal_type' => 'lunch', 'eaten_at' => "{$this->day}T12:00:00Z", 'nutrition_status' => 'estimated', 'kcal' => 800], $extra))->assertCreated()->json('data');
    }

    public function test_new_user_gets_unavailable_values_not_zeros(): void
    {
        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->assertOk()->json('data');
        $this->assertNull($r['consumed']['total_kcal']);
        $this->assertNull($r['expenditure']['resting']['kcal']);
        $this->assertNull($r['expenditure']['total_kcal']);
        $this->assertNull($r['balance']['kcal']);
        $this->assertNotEmpty($r['expenditure']['resting']['missing']);
        $this->assertNotEmpty($r['balance']['reasons']);
        $this->assertFalse($r['watch_energy']['used']);
    }

    public function test_total_is_resting_plus_net_activity_never_gross(): void
    {
        $this->completeProfile();
        $this->meal();
        $this->walk(60);
        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->assertOk()->json('data');

        $rest = $r['expenditure']['resting']['kcal'];
        $net = $r['expenditure']['activities']['net_kcal'];
        $gross = $r['expenditure']['activities']['gross_kcal_info_only'];
        // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25 -> 1320
        $this->assertEquals(1320, $rest);
        $this->assertEqualsWithDelta(3.5 * 3.5 * 60 / 200 * 60 - 3.5 * 3.5 * 60 / 200 * 60 * (1 / 3.5), $net, 0.2); // (MET-1) model
        $this->assertGreaterThan($net, $gross);
        $this->assertEquals(round($rest + $net), $r['expenditure']['total_kcal']);
        $this->assertNotEquals(round($rest + $gross), $r['expenditure']['total_kcal']); // no double counting of resting cost
        $this->assertEquals(800 - $r['expenditure']['total_kcal'], $r['balance']['kcal']);
    }

    public function test_balance_updates_after_editing_or_deleting_entries_without_manual_totals(): void
    {
        $this->completeProfile();
        $m = $this->meal();
        $a = $this->walk(60);
        $before = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data.balance.kcal');

        $this->patchJson("/api/v1/food-entries/{$m['id']}", ['kcal' => 1000])->assertOk();
        $afterFood = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data.balance.kcal');
        $this->assertEquals($before + 200, $afterFood);

        $this->patchJson("/api/v1/activity-entries/{$a['id']}", ['duration_minutes' => 120])->assertOk();
        $afterAct = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data.balance.kcal');
        $this->assertLessThan($afterFood, $afterAct);

        $this->deleteJson("/api/v1/activity-entries/{$a['id']}")->assertOk();
        $this->assertGreaterThan($afterAct, $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data.balance.kcal'));
    }

    public function test_foods_without_calories_are_listed_as_missing_and_not_counted_as_zero(): void
    {
        $this->completeProfile();
        $this->meal();
        $this->meal(['name' => 'Sauce maison', 'nutrition_status' => 'unknown', 'kcal' => 500, 'meal_type' => 'dinner']);
        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data');
        $this->assertEquals(800, $r['consumed']['total_kcal']);
        $this->assertCount(1, $r['consumed']['missing']);
        $this->assertFalse($r['balance']['complete']);
        $this->assertNotEmpty($r['balance']['caveats']);
    }

    public function test_missing_weight_or_duration_makes_the_activity_unavailable(): void
    {
        HealthProfile::unguarded(fn () => HealthProfile::updateOrCreate(['user_id' => $this->user->id], ['sex' => 'male', 'birth_date' => '1990-01-01', 'height_cm' => 175, 'timezone' => 'UTC']));
        $this->postJson('/api/v1/activity-entries', ['catalog_id' => $this->catalog('course'), 'started_at' => "{$this->day}T08:00:00Z", 'duration_minutes' => 30])->assertCreated()
            ->assertJsonPath('data.estimate.quality', 'unavailable')->assertJsonPath('data.estimate.gross_kcal', null);

        $this->postJson('/api/v1/activity-entries', ['catalog_id' => $this->catalog('course'), 'started_at' => "{$this->day}T09:00:00Z", 'weight_kg' => 70])->assertCreated()
            ->assertJsonPath('data.estimate.quality', 'unavailable');

        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data');
        $this->assertNull($r['expenditure']['activities']['net_kcal']);
        $this->assertNull($r['expenditure']['total_kcal']);
    }

    public function test_entry_weight_override_is_used_and_flagged(): void
    {
        $r = $this->walk(60, ['weight_kg' => 80])['estimate'];
        $this->assertSame('entry', $r['weight_source']);
        $this->assertEqualsWithDelta(3.5 * 3.5 * 80 / 200 * 60, $r['gross_kcal'], 0.2);
    }

    public function test_custom_activity_needs_label_and_effort(): void
    {
        $id = $this->catalog('autre');
        $base = ['catalog_id' => $id, 'started_at' => "{$this->day}T10:00:00Z", 'duration_minutes' => 30, 'weight_kg' => 70];
        $this->postJson('/api/v1/activity-entries', $base)->assertUnprocessable();
        $this->postJson('/api/v1/activity-entries', $base + ['custom_label' => 'Lessive à la main'])->assertCreated()->assertJsonPath('data.estimate.quality', 'unavailable');
        $this->postJson('/api/v1/activity-entries', $base + ['custom_label' => 'Lessive à la main', 'perceived_effort' => 5])->assertCreated()->assertJsonPath('data.estimate.quality', 'low')->assertJsonPath('data.estimate.met', 4);
    }

    public function test_activity_validation(): void
    {
        $ok = ['catalog_id' => $this->catalog('marche-normale'), 'started_at' => "{$this->day}T10:00:00Z"];
        $this->postJson('/api/v1/activity-entries', $ok + ['duration_minutes' => 0])->assertUnprocessable();
        $this->postJson('/api/v1/activity-entries', $ok + ['duration_minutes' => 2000])->assertUnprocessable();
        $this->postJson('/api/v1/activity-entries', $ok + ['perceived_effort' => 11])->assertUnprocessable();
        $this->postJson('/api/v1/activity-entries', ['catalog_id' => 99999, 'started_at' => "{$this->day}T10:00:00Z"])->assertUnprocessable();
        $this->postJson('/api/v1/activity-entries', ['started_at' => "{$this->day}T10:00:00Z"])->assertUnprocessable(); // no type, no catalogue
    }

    public function test_several_meals_and_activities_in_one_day_and_history(): void
    {
        $this->completeProfile();
        $this->meal();
        $this->meal(['name' => 'Foufou', 'meal_type' => 'dinner', 'kcal' => 600, 'eaten_at' => "{$this->day}T19:00:00Z"]);
        $this->walk(30);
        $this->walk(20, ['started_at' => "{$this->day}T17:00:00Z"]);
        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data');
        $this->assertEquals(1400, $r['consumed']['total_kcal']);
        $this->assertCount(2, $r['expenditure']['activities']['items']);
        $this->assertCount(2, $r['consumed']['by_meal']);

        $h = $this->getJson("/api/v1/energy/history?range=custom&from=2026-10-18&to=2026-10-21")->assertOk()->json('data');
        $this->assertCount(4, $h['days']);
        $this->assertSame(1, $h['summary']['days_with_balance']);
        $this->assertNull($h['days'][0]['balance_kcal']); // days without data stay null, not 0
    }

    public function test_day_timeline_separates_declared_from_detected(): void
    {
        $this->completeProfile();
        $this->walk(30);
        $this->postJson('/api/v1/consents', ['purpose' => 'gps_tracking', 'granted' => true])->assertCreated();
        $t = $this->postJson('/api/v1/tracks', ['started_at' => "{$this->day}T06:00:00Z"])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/tracks/$t/points", ['points' => [['lat' => 0, 'lng' => 0, 'accuracy' => 5, 'captured_at' => "{$this->day}T06:00:10Z"], ['lat' => 0.001, 'lng' => 0, 'accuracy' => 5, 'captured_at' => "{$this->day}T06:01:10Z"]]])->assertOk();
        $this->postJson("/api/v1/tracks/$t/finish")->assertOk();

        $d = $this->getJson("/api/v1/day?date={$this->day}")->assertOk()->json('data');
        $types = collect($d['timeline'])->keyBy('type');
        $this->assertFalse($types['activity']['detected']);
        $this->assertTrue($types['track']['detected']);
        $this->assertSame('gps', $types['track']['source']);
        $this->assertEquals(0.11, $d['recap']['distance_gps_unassigned_km']);
        $this->assertNull($d['recap']['distance_declared_km']);
        $this->assertContains('repas', $d['recap']['missing']);
    }

    public function test_energy_data_is_private(): void
    {
        $this->completeProfile();
        $this->meal();
        $other = User::factory()->create();
        Sanctum::actingAs($other);
        $r = $this->getJson("/api/v1/energy/daily?date={$this->day}")->json('data');
        $this->assertSame(0, $r['consumed']['entries']);
        $this->assertNull($r['consumed']['total_kcal']);
        $this->assertSame([], $r['expenditure']['activities']['items']);
    }

    public function test_catalogue_contains_the_requested_activities(): void
    {
        $names = collect($this->getJson('/api/v1/activity-catalog')->assertOk()->json('data'))->pluck('name')->implode('|');
        foreach (['Marche lente', 'Marche normale', 'Marche rapide', 'montée', 'Course', 'Vélo', 'Danse', 'Football', 'ménagers', 'Nettoyage', 'Jardinage', 'Travail physique', 'assise', 'Déplacements à pied', "escaliers", 'Autre'] as $needle) {
            $this->assertStringContainsString($needle, $names);
        }
    }
}

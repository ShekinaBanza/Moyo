<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\HealthProfile;
use App\Models\User;
use App\Models\WorkoutProgram;
use Database\Seeders\ActivityCatalogSeeder;
use Database\Seeders\ExerciseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExercisesTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ActivityCatalogSeeder::class);
        $this->seed(ExerciseSeeder::class);
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    private function ex(string $slug): int
    {
        return Exercise::where('slug', $slug)->value('id');
    }

    private function sessionPayload(array $slugs = ['squat', 'pont-fessier'], array $extra = []): array
    {
        $start = now()->subMinutes(20);

        return array_merge([
            'client_id' => 'ws-1', 'name' => 'Ma séance', 'started_at' => $start->toIso8601String(), 'ended_at' => now()->toIso8601String(), 'effective_seconds' => 1000,
            'perceived_difficulty' => 3,
            'exercises' => array_map(fn ($s) => ['exercise_id' => $this->ex($s), 'planned_sets' => 2, 'sets' => [['reps' => 10], ['reps' => 8]]], $slugs),
        ], $extra);
    }

    private function weigh(): void
    {
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 70, 'measured_at' => now()->subDay()->toIso8601String()])->assertCreated();
    }

    // ---------- catalogue ----------

    public function test_categories_musculation_and_abdominaux_are_available_with_complete_content(): void
    {
        foreach (['musculation', 'abdominaux', 'mobilite', 'general'] as $cat) {
            $this->assertNotEmpty($this->getJson("/api/v1/exercises?category=$cat")->assertOk()->json('data'), $cat);
        }
        $groups = collect($this->getJson('/api/v1/exercises?category=musculation')->json('data'))->pluck('muscle_group')->unique();
        foreach (['pectoraux', 'dos', 'epaules', 'biceps_triceps', 'jambes', 'fessiers'] as $g) {
            $this->assertTrue($groups->contains($g), "missing group $g");
        }
        $abs = collect($this->getJson('/api/v1/exercises?category=abdominaux')->json('data'))->pluck('slug');
        foreach (['crunch', 'dead-bug', 'gainage-ventral', 'gainage-lateral', 'bird-dog', 'releves-genoux'] as $s) {
            $this->assertTrue($abs->contains($s), "missing $s");
        }
        foreach (Exercise::all() as $e) {
            $this->assertNotEmpty($e->steps, $e->slug);
            $this->assertNotEmpty($e->mistakes, $e->slug);
            $this->assertNotEmpty($e->breathing, $e->slug);
            $this->assertNotEmpty($e->precautions, $e->slug);
            $this->assertNotEmpty($e->easier_variant, $e->slug);
            $this->assertNotEmpty($e->muscles, $e->slug);
            foreach (['beginner', 'intermediate', 'advanced'] as $lvl) {
                $this->assertArrayHasKey($lvl, $e->prescriptions, $e->slug);
                $this->assertGreaterThan(0, $e->prescriptions[$lvl]['sets']);
                $this->assertArrayHasKey($e->kind === 'time' ? 'seconds' : 'reps', $e->prescriptions[$lvl], $e->slug);
            }
        }
        $this->assertSame('beginner', $this->getJson('/api/v1/exercises/pompes-genoux')->json('data.level'));
        $this->getJson('/api/v1/exercises/inconnu')->assertNotFound();
        $this->getJson('/api/v1/exercises?category=nope')->assertUnprocessable();
    }

    public function test_every_exercise_has_existing_start_and_end_illustrations(): void
    {
        foreach (Exercise::all() as $e) {
            foreach ([$e->image_start, $e->image_end] as $img) {
                $this->assertFileExists(public_path(ltrim($img, '/')), "{$e->slug}: $img");
                $this->assertGreaterThan(200, filesize(public_path(ltrim($img, '/'))));
            }
        }
        foreach (['banner', 'cat-musculation', 'cat-abdominaux', 'cat-mobilite', 'cat-general'] as $f) {
            $this->assertFileExists(public_path("images/exercises/$f.svg"));
        }
        foreach (\App\Models\ActivityCatalogItem::pluck('icon') as $icon) {
            $this->assertFileExists(public_path("images/activities/$icon.svg"), $icon);
        }
    }

    public function test_equipment_options_cover_none_dumbbells_bands_and_gym(): void
    {
        $eq = Exercise::all()->pluck('equipment')->flatten()->unique()->all();
        foreach (['none', 'dumbbells', 'bands', 'gym'] as $e) {
            $this->assertContains($e, $eq);
        }
    }

    // ---------- programs ----------

    public function test_templates_exist_are_read_only_and_can_be_duplicated_then_edited(): void
    {
        $list = $this->getJson('/api/v1/workout-programs')->assertOk()->json('data');
        $templates = collect($list)->where('is_template', true);
        $this->assertCount(5, $templates);
        $tpl = $templates->first();
        $this->assertGreaterThan(0, $tpl['estimated_minutes']);
        $this->assertNotEmpty($tpl['items'][0]['exercise']['image_start']);

        $this->patchJson("/api/v1/workout-programs/{$tpl['id']}", ['name' => 'hack'])->assertForbidden();
        $this->deleteJson("/api/v1/workout-programs/{$tpl['id']}")->assertForbidden();

        $copy = $this->postJson("/api/v1/workout-programs/{$tpl['id']}/duplicate")->assertCreated()->json('data');
        $this->assertFalse($copy['is_template']);
        $this->assertSame($this->user->id, $copy['user_id']);
        $this->patchJson("/api/v1/workout-programs/{$copy['id']}", ['name' => 'Ma version'])->assertOk()->assertJsonPath('data.name', 'Ma version');
        $this->assertDatabaseHas('workout_programs', ['id' => $tpl['id'], 'name' => $tpl['name']]);
    }

    public function test_user_creates_edits_and_deletes_a_program_with_validation(): void
    {
        $body = ['name' => 'Ma séance 15 min', 'goal' => 'strength', 'level' => 'beginner', 'target_minutes' => 15, 'equipment' => ['none'], 'muscle_groups' => ['jambes'], 'days' => [1, 3, 5],
            'exercises' => [['exercise_id' => $this->ex('squat'), 'sets' => 3, 'reps' => 10, 'rest_seconds' => 45], ['exercise_id' => $this->ex('gainage-ventral'), 'sets' => 2, 'seconds' => 20, 'rest_seconds' => 30]]];
        $id = $this->postJson('/api/v1/workout-programs', $body)->assertCreated()->assertJsonCount(2, 'data.items')->json('data.id');

        $this->postJson('/api/v1/workout-programs', array_merge($body, ['exercises' => []]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-programs', array_merge($body, ['exercises' => [['exercise_id' => $this->ex('squat'), 'sets' => 3]]]))->assertUnprocessable(); // neither reps nor seconds
        $this->postJson('/api/v1/workout-programs', array_merge($body, ['exercises' => [['exercise_id' => 99999, 'sets' => 3, 'reps' => 5]]]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-programs', array_merge($body, ['days' => [9]]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-programs', array_merge($body, ['goal' => 'x']))->assertUnprocessable();

        $this->patchJson("/api/v1/workout-programs/$id", ['exercises' => [['exercise_id' => $this->ex('crunch'), 'sets' => 2, 'reps' => 8]]])->assertOk()->assertJsonCount(1, 'data.items');
        $this->deleteJson("/api/v1/workout-programs/$id")->assertOk();
        $this->getJson("/api/v1/workout-programs/$id")->assertNotFound();
    }

    // ---------- sessions ----------

    public function test_session_is_saved_with_real_sets_and_a_labelled_estimate_and_is_idempotent(): void
    {
        $this->weigh();
        $r = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->assertCreated();
        $r->assertJsonCount(2, 'data.items')->assertJsonPath('data.items.0.sets.0.reps', 10)->assertJsonPath('data.items.0.name', 'Squat');
        $this->assertGreaterThan(0, $r->json('data.calories_est'));
        $this->assertStringContainsString('Estimation', $r->json('data.estimate.method'));
        $this->assertSame(3.5, $r->json('data.met')); // musculation category MET

        $again = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->assertOk()->assertJsonPath('duplicate', true);
        $this->assertSame($r->json('data.id'), $again->json('data.id'));
        $this->assertDatabaseCount('workout_sessions', 1);
    }

    public function test_calories_are_unavailable_without_a_weight_instead_of_invented(): void
    {
        $r = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->assertCreated();
        $this->assertNull($r->json('data.calories_est'));
        $this->assertStringContainsString('poids', $r->json('data.estimate.method'));
    }

    public function test_session_validation(): void
    {
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['effective_seconds' => 99999]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['effective_seconds' => 5000]))->assertUnprocessable(); // longer than elapsed time
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['ended_at' => now()->subHour()->toIso8601String()]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['perceived_difficulty' => 9]))->assertUnprocessable();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['exercises' => []]))->assertUnprocessable();
        $p = $this->sessionPayload(['squat']);
        $p['exercises'][0]['sets'][0]['reps'] = 9999;
        $this->postJson('/api/v1/workout-sessions', $p)->assertUnprocessable();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['program_id' => 99999]))->assertUnprocessable();
    }

    public function test_history_lists_only_my_sessions_and_can_be_edited_and_deleted(): void
    {
        $id = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->json('data.id');
        $this->getJson('/api/v1/workout-sessions')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/workout-sessions/$id", ['notes' => 'Bien', 'perceived_difficulty' => 2])->assertOk()->assertJsonPath('data.notes', 'Bien');
        $this->deleteJson("/api/v1/workout-sessions/$id")->assertOk();
        $this->getJson('/api/v1/workout-sessions')->assertJsonCount(0, 'data');
    }

    // ---------- safety ----------

    public function test_access_is_open_without_warning_symptoms(): void
    {
        $this->getJson('/api/v1/exercises/access')->assertOk()->assertJsonPath('data.mode', 'open');
    }

    public function test_breathlessness_and_swelling_restrict_to_mobility_and_block_intense_sessions(): void
    {
        $t = now()->subDay()->toIso8601String();
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'breathlessness', 'occurred_at' => $t, 'intensity' => 4])->assertCreated();
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'swelling', 'occurred_at' => $t, 'intensity' => 3])->assertCreated();

        $a = $this->getJson('/api/v1/exercises/access')->assertOk()->assertJsonPath('data.mode', 'restricted')->json('data');
        $this->assertSame(['mobilite'], $a['allowed_categories']);

        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat']))->assertForbidden()->assertJsonPath('code', 'exercise_restricted');
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['gainage-ventral'], ['client_id' => 'a2']))->assertForbidden();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['chat-vache', 'posture-enfant'], ['client_id' => 'a3']))->assertCreated(); // gentle mobility stays possible
        $this->assertDatabaseCount('workout_sessions', 1);
    }

    public function test_emergency_signs_block_every_session(): void
    {
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'chest_pain', 'occurred_at' => now()->subMinutes(5)->toIso8601String(), 'intensity' => 5])->assertCreated();
        $this->getJson('/api/v1/exercises/access')->assertJsonPath('data.mode', 'blocked');
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['chat-vache']))->assertForbidden()->assertJsonPath('code', 'exercise_blocked');
    }

    public function test_a_symptom_from_the_last_month_restricts_until_a_professional_evaluation_is_declared(): void
    {
        $this->postJson('/api/v1/symptoms', ['symptom_type' => 'breathlessness', 'occurred_at' => now()->subDays(20)->toIso8601String(), 'intensity' => 3])->assertCreated();
        $this->getJson('/api/v1/exercises/access')->assertJsonPath('data.mode', 'restricted');

        $this->patchJson('/api/v1/profile', ['evaluated_by_professional' => true])->assertOk();
        $this->getJson('/api/v1/exercises/access')->assertJsonPath('data.mode', 'open');
    }

    // ---------- energy journal integration ----------

    public function test_logging_a_session_creates_one_activity_counted_in_the_energy_balance(): void
    {
        $this->weigh();
        $sid = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->json('data.id');
        $r = $this->postJson("/api/v1/workout-sessions/$sid/log-activity")->assertCreated();
        $this->assertTrue($r->json('logged'));
        $this->assertSame('manual', $r->json('activity.source_type'));
        $this->assertGreaterThan(0, $r->json('estimate.net_kcal'));
        $this->assertSame($r->json('activity.id'), $r->json('data.activity_entry_id'));

        $this->postJson("/api/v1/workout-sessions/$sid/log-activity")->assertStatus(409)->assertJsonPath('code', 'already_logged');
        $this->assertDatabaseCount('activity_entries', 1);
        $day = now()->toDateString();
        $energy = $this->getJson("/api/v1/energy/daily?date=$day")->json('data.expenditure.activities.items');
        $this->assertCount(1, $energy);
    }

    public function test_an_overlapping_manual_activity_must_be_resolved_to_avoid_double_counting(): void
    {
        $this->weigh();
        $cat = \App\Models\ActivityCatalogItem::where('slug', 'renforcement-general')->value('id');
        $manual = $this->postJson('/api/v1/activity-entries', ['catalog_id' => $cat, 'started_at' => now()->subMinutes(18)->toIso8601String(), 'duration_minutes' => 15])->assertCreated()->json('data.id');
        $sid = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->json('data.id');

        $r = $this->postJson("/api/v1/workout-sessions/$sid/log-activity")->assertStatus(409)->assertJsonPath('code', 'possible_duplicate');
        $this->assertSame($manual, $r->json('conflicts.0.id'));
        $this->assertDatabaseCount('activity_entries', 1); // nothing added yet

        $this->postJson("/api/v1/workout-sessions/$sid/log-activity", ['on_duplicate' => 'skip'])->assertOk()->assertJsonPath('logged', false);
        $this->assertDatabaseCount('activity_entries', 1);

        $this->postJson("/api/v1/workout-sessions/$sid/log-activity", ['on_duplicate' => 'replace'])->assertCreated();
        $this->assertDatabaseMissing('activity_entries', ['id' => $manual]);
        $this->assertDatabaseCount('activity_entries', 1);
    }

    public function test_detected_activities_are_never_replaced_automatically(): void
    {
        $this->weigh();
        $cat = \App\Models\ActivityCatalogItem::where('slug', 'marche-normale')->value('id');
        $this->postJson('/api/v1/activity-entries', ['catalog_id' => $cat, 'started_at' => now()->subMinutes(18)->toIso8601String(), 'duration_minutes' => 15, 'source_type' => 'gps'])->assertCreated();
        $sid = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->json('data.id');
        $this->postJson("/api/v1/workout-sessions/$sid/log-activity", ['on_duplicate' => 'replace'])->assertUnprocessable()->assertJsonPath('code', 'cannot_replace_detected');
        $this->postJson("/api/v1/workout-sessions/$sid/log-activity", ['on_duplicate' => 'keep_both'])->assertCreated();
        $this->assertDatabaseCount('activity_entries', 2);
    }

    // ---------- isolation ----------

    public function test_other_users_cannot_see_change_delete_or_log_my_sessions_and_programs(): void
    {
        $sid = $this->postJson('/api/v1/workout-sessions', $this->sessionPayload())->json('data.id');
        $pid = $this->postJson('/api/v1/workout-programs', ['name' => 'Privé', 'goal' => 'strength', 'level' => 'beginner', 'exercises' => [['exercise_id' => $this->ex('squat'), 'sets' => 2, 'reps' => 8]]])->json('data.id');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/workout-sessions')->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/workout-sessions/$sid")->assertNotFound();
        $this->patchJson("/api/v1/workout-sessions/$sid", ['notes' => 'x'])->assertNotFound();
        $this->deleteJson("/api/v1/workout-sessions/$sid")->assertNotFound();
        $this->postJson("/api/v1/workout-sessions/$sid/log-activity")->assertNotFound();

        $this->assertNotContains($pid, collect($this->getJson('/api/v1/workout-programs')->json('data'))->pluck('id')->all());
        $this->getJson("/api/v1/workout-programs/$pid")->assertNotFound();
        $this->patchJson("/api/v1/workout-programs/$pid", ['name' => 'x'])->assertNotFound();
        $this->deleteJson("/api/v1/workout-programs/$pid")->assertNotFound();
        $this->postJson("/api/v1/workout-programs/$pid/duplicate")->assertNotFound();
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload(['squat'], ['program_id' => $pid, 'client_id' => 'zz']))->assertUnprocessable(); // cannot attach to someone else's program

        $this->assertDatabaseHas('workout_programs', ['id' => $pid, 'name' => 'Privé']);
        $this->assertSame(1, WorkoutProgram::where('user_id', $this->user->id)->count());
    }

    public function test_exercise_routes_require_authentication(): void
    {
        $this->app['auth']->forgetGuards();
        $this->refreshApplication();
        foreach (['exercises', 'exercises/access', 'workout-programs', 'workout-sessions'] as $u) {
            $this->getJson("/api/v1/$u")->assertUnauthorized();
        }
    }

    public function test_export_includes_my_workouts(): void
    {
        $this->postJson('/api/v1/workout-sessions', $this->sessionPayload());
        $this->postJson('/api/v1/account/export')->assertOk()->assertJsonCount(1, 'workout_sessions');
    }
}

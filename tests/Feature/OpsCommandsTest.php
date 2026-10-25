<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ActivityCatalogSeeder;
use Database\Seeders\ExerciseSeeder;
use Database\Seeders\FoodCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OpsCommandsTest extends TestCase
{
    use RefreshDatabase;

    private string $file;

    protected function setUp(): void
    {
        parent::setUp();
        $this->file = sys_get_temp_dir().DIRECTORY_SEPARATOR.'moyo-src-'.uniqid().'.sqlite';
    }

    protected function tearDown(): void
    {
        DB::purge('src_tmp');
        @unlink($this->file);
        parent::tearDown();
    }

    /** Builds a legacy SQLite file with the same catalogues and some user data. */
    private function legacy(bool $sameCatalogIds = true): void
    {
        touch($this->file);
        config(['database.connections.src_tmp' => ['driver' => 'sqlite', 'database' => $this->file, 'prefix' => '', 'foreign_key_constraints' => false]]);
        Artisan::call('migrate', ['--database' => 'src_tmp', '--force' => true]);
        $src = DB::connection('src_tmp');
        foreach (['food_catalog', 'activity_catalog', 'exercises'] as $t) {
            foreach (DB::table($t)->get() as $r) {
                $row = (array) $r;
                if (! $sameCatalogIds && $t === 'activity_catalog' && $row['id'] === 1) {
                    $row['id'] = 999;
                }
                $src->table($t)->insert($row);
            }
        }
        $now = now()->toDateTimeString();
        $src->table('users')->insert(['id' => 7, 'name' => 'Ancien', 'email' => 'ancien@example.test', 'password' => 'x', 'created_at' => $now, 'updated_at' => $now]);
        $src->table('health_profiles')->insert(['user_id' => 7, 'timezone' => 'UTC', 'created_at' => $now, 'updated_at' => $now]);
        $src->table('body_measurements')->insert(['user_id' => 7, 'kind' => 'weight', 'value' => 70, 'unit' => 'kg', 'measured_at' => $now, 'source_type' => 'manual', 'created_at' => $now, 'updated_at' => $now]);
        $src->table('activity_entries')->insert(['user_id' => 7, 'catalog_id' => 2, 'activity_type' => 'walking', 'started_at' => $now, 'duration_minutes' => 30, 'source_type' => 'manual', 'created_at' => $now, 'updated_at' => $now]);
        $src->table('workout_programs')->insert(['id' => 50, 'user_id' => 7, 'name' => 'Perso', 'goal' => 'strength', 'level' => 'beginner', 'is_template' => 0, 'created_at' => $now, 'updated_at' => $now]);
        $src->table('workout_program_exercises')->insert(['program_id' => 50, 'exercise_id' => 1, 'position' => 0, 'sets' => 2, 'reps' => 8, 'rest_seconds' => 60]);
    }

    public function test_copy_is_a_dry_run_by_default_and_changes_nothing(): void
    {
        $this->seed([FoodCatalogSeeder::class, ActivityCatalogSeeder::class, ExerciseSeeder::class]);
        $this->legacy();
        $this->artisan('moyo:copy-from-sqlite', ['path' => $this->file])->expectsOutputToContain('aucune écriture')->assertSuccessful();
        $this->assertSame(0, User::count());
        $this->assertSame(0, DB::table('body_measurements')->count());
    }

    public function test_execute_copies_user_data_verifies_counts_and_leaves_the_source_untouched(): void
    {
        $this->seed([FoodCatalogSeeder::class, ActivityCatalogSeeder::class, ExerciseSeeder::class]);
        $this->legacy();
        $before = DB::connection('src_tmp')->table('users')->count();
        $templatesBefore = DB::table('workout_programs')->whereNull('user_id')->count();

        $this->artisan('moyo:copy-from-sqlite', ['path' => $this->file, '--execute' => true])->expectsOutputToContain('vérifiée')->assertSuccessful();

        $this->assertDatabaseHas('users', ['id' => 7, 'email' => 'ancien@example.test']);
        $this->assertSame(1, DB::table('body_measurements')->where('user_id', 7)->count());
        $this->assertSame(1, DB::table('activity_entries')->where('user_id', 7)->where('catalog_id', 2)->count());
        $this->assertSame(1, DB::table('workout_programs')->where('user_id', 7)->count());
        $this->assertSame(1, DB::table('workout_program_exercises')->where('program_id', 50)->count());
        $this->assertSame($templatesBefore, DB::table('workout_programs')->whereNull('user_id')->count()); // seeded templates untouched, not duplicated
        $this->assertSame($before, DB::connection('src_tmp')->table('users')->count());
    }

    public function test_it_refuses_to_copy_into_a_target_that_already_has_user_data(): void
    {
        $this->seed([FoodCatalogSeeder::class, ActivityCatalogSeeder::class, ExerciseSeeder::class]);
        $this->legacy();
        User::factory()->create();
        $this->artisan('moyo:copy-from-sqlite', ['path' => $this->file, '--execute' => true])->expectsOutputToContain('contient déjà des données')->assertFailed();
        $this->assertSame(1, User::count()); // nothing deleted, nothing added
        $this->assertDatabaseMissing('users', ['id' => 7]);
    }

    public function test_it_refuses_when_catalogue_ids_differ_because_foreign_keys_would_break(): void
    {
        $this->seed([FoodCatalogSeeder::class, ActivityCatalogSeeder::class, ExerciseSeeder::class]);
        $this->legacy(false);
        $this->artisan('moyo:copy-from-sqlite', ['path' => $this->file, '--execute' => true])->expectsOutputToContain('Catalogue')->assertFailed();
        $this->assertSame(0, User::count());
    }

    public function test_missing_source_file_is_reported(): void
    {
        $this->artisan('moyo:copy-from-sqlite', ['path' => $this->file.'.nope'])->expectsOutputToContain('introuvable')->assertFailed();
    }

    public function test_production_check_reports_a_bad_configuration_and_never_prints_secrets(): void
    {
        config(['app.env' => 'production', 'app.debug' => true, 'app.key' => 'base64:SECRETSECRETSECRETSECRETSECRET=', 'app.url' => 'http://example.test', 'database.default' => 'sqlite']);
        $this->artisan('moyo:check')->expectsOutputToContain('APP_DEBUG')->doesntExpectOutputToContain('SECRETSECRET')->assertFailed();
    }

    public function test_production_check_passes_on_a_sound_configuration(): void
    {
        $this->seed(ExerciseSeeder::class);
        $manifest = public_path('build/manifest.json');
        $this->assertFileExists($manifest, 'public/build must be built (npm run build)');
        config(['app.env' => 'production', 'app.debug' => false, 'app.url' => 'https://moyo.example.test', 'app.timezone' => 'UTC', 'session.secure' => true,
            'sanctum.stateful' => ['moyo.example.test'], 'mail.default' => 'smtp']);
        $this->artisan('moyo:check')->expectsOutputToContain('Build Vite')->assertSuccessful();
    }
}

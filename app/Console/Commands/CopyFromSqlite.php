<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One-way, NON-DESTRUCTIVE copy of the USER data of an existing SQLite database into the configured (MySQL) database.
 *  - the source file is opened and never modified;
 *  - the target is never emptied or altered: it must have no user data yet;
 *  - dry run by default; --execute copies inside ONE transaction and rolls back if any count does not match.
 * Shared catalogues (foods, activities, exercises, templates) are NOT copied: they come from the seeders on both sides,
 * and the command refuses to run if their ids differ (records reference them by id).
 * See docs/DB_MIGRATION.md.
 */
class CopyFromSqlite extends Command
{
    protected $signature = 'moyo:copy-from-sqlite {path : path of the SQLite file (read only)} {--execute : really copy (default: dry run)}';

    protected $description = 'Copy user data from a SQLite file to the current database (dry run by default, never deletes)';

    /** parents first (foreign keys). table => [filter column or null] */
    private const TABLES = [
        'users', 'health_profiles', 'wearable_devices', 'wearable_capabilities', 'health_measurements', 'sleep_records',
        'symptom_entries', 'body_measurements', 'food_entries', 'gps_tracks', 'gps_track_points', 'activity_entries',
        'habit_records', 'reminders', 'sync_operations', 'consent_records', 'audit_events', 'notification_preferences',
        'notifications', 'push_subscriptions', 'workout_programs', 'workout_program_exercises', 'workout_sessions', 'workout_session_exercises',
    ];

    private const CATALOGS = ['food_catalog' => 'slug', 'activity_catalog' => 'slug', 'exercises' => 'slug'];

    public function handle(): int
    {
        $path = $this->argument('path');
        if (! is_file($path)) {
            $this->error("Fichier introuvable : {$path}");

            return self::FAILURE;
        }
        DB::purge('legacy_sqlite'); // never reuse a cached connection to another file
        config(['database.connections.legacy_sqlite' => ['driver' => 'sqlite', 'database' => realpath($path), 'prefix' => '', 'foreign_key_constraints' => false]]);
        $src = DB::connection('legacy_sqlite');
        $dst = DB::connection();
        $same = $dst->getDriverName() === 'sqlite' && realpath((string) $dst->getDatabaseName()) === realpath($path);
        if ($same) {
            $this->error('La source et la cible sont le même fichier SQLite : rien à copier.');

            return self::FAILURE;
        }

        // 1. catalogue ids must match, otherwise foreign keys would point to the wrong rows
        foreach (self::CATALOGS as $table => $key) {
            if (! $this->hasTable($src, $table)) {
                continue;
            }
            $a = $src->table($table)->pluck('id', $key);
            $b = $dst->table($table)->pluck('id', $key);
            foreach ($a as $slug => $id) {
                if (($b[$slug] ?? null) !== $id) {
                    $this->error("Catalogue « {$table} » : « {$slug} » a l'id {$id} dans la source et ".($b[$slug] ?? 'aucun')." dans la cible. Lancez d'abord `php artisan db:seed --force` sur une base cible vide, puis réessayez.");

                    return self::FAILURE;
                }
            }
        }

        // 2. the target must hold no user data yet
        $plan = [];
        foreach (self::TABLES as $t) {
            if (! $this->hasTable($src, $t) || ! Schema::hasTable($t)) {
                continue;
            }
            $rows = $this->rowsOf($src, $t)->count();
            $existing = $this->rowsOf($dst, $t)->count();
            $plan[$t] = [$rows, $existing];
        }
        if (isset($plan['workout_programs']) && $plan['workout_programs'][0] > 0) {
            $clash = $dst->table('workout_programs')->whereIn('id', $src->table('workout_programs')->whereNotNull('user_id')->pluck('id'))->count();
            if ($clash > 0) {
                $this->error("{$clash} programme(s) de la source ont le même id qu'un programme déjà présent dans la cible (modèles) : copie refusée pour ne rien mélanger.");

                return self::FAILURE;
            }
        }
        $busy = array_filter($plan, fn ($p) => $p[1] > 0);
        $this->table(['Table', 'Lignes source', 'Lignes cible'], array_map(fn ($t, $p) => [$t, $p[0], $p[1]], array_keys($plan), $plan));
        if ($busy) {
            $this->error('La cible contient déjà des données utilisateur ('.implode(', ', array_keys($busy)).') : rien n\'est copié pour ne rien écraser ni dupliquer.');

            return self::FAILURE;
        }
        if (! $this->option('execute')) {
            $this->info('Simulation terminée : aucune écriture. Relancez avec --execute APRÈS avoir sauvegardé les deux bases.');

            return self::SUCCESS;
        }

        // 3. copy in one transaction, verify, otherwise roll back
        try {
            $dst->transaction(function () use ($src, $dst, $plan) {
                foreach ($plan as $t => [$count]) {
                    $this->rowsOf($src, $t)->chunk(200)->each(fn ($chunk) => $dst->table($t)->insert($chunk->map(fn ($r) => $this->prepare($t, (array) $r))->all()));
                    $copied = $this->rowsOf($dst, $t)->count();
                    if ($copied !== $count) {
                        throw new \RuntimeException("{$t} : {$copied} lignes copiées sur {$count}");
                    }
                }
            });
        } catch (\Throwable $e) {
            $this->error('Copie annulée (aucune donnée écrite) : '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info('Copie terminée et vérifiée : le nombre de lignes de chaque table correspond. La source n\'a pas été modifiée.');

        return self::SUCCESS;
    }

    /** Rows nobody references keep a fresh id (the seeded templates already use the first ids of their tables). */
    private function prepare(string $table, array $row): array
    {
        if ($table === 'workout_program_exercises') {
            unset($row['id']);
        }

        return $row;
    }

    private function hasTable($conn, string $table): bool
    {
        return $conn->getSchemaBuilder()->hasTable($table);
    }

    /** Template programs (user_id null) belong to the seeders, not to the user data. */
    private function rowsOf($conn, string $t)
    {
        $q = $conn->table($t);
        if ($t === 'workout_programs') {
            $q->whereNotNull('user_id');
        }
        if ($t === 'workout_program_exercises') {
            $q->whereIn('program_id', $conn->table('workout_programs')->whereNotNull('user_id')->select('id'));
        }

        return $q->get();
    }
}

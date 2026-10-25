<?php

namespace App\Console\Commands;

use App\Models\Exercise;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only production readiness check. Run it ON the server after deployment:  php artisan moyo:check
 * It never writes to the database and never prints a secret.
 */
class MoyoCheck extends Command
{
    protected $signature = 'moyo:check {--strict : treat warnings as failures}';

    protected $description = 'Check the production configuration (env, database, build, permissions) without changing anything';

    private int $failures = 0;

    private int $warnings = 0;

    private function good(string $label, string $detail = ''): void
    {
        $this->line("  <fg=green>OK</>      {$label}".($detail ? " — {$detail}" : ''));
    }

    private function caution(string $label, string $detail): void
    {
        $this->warnings++;
        $this->line("  <fg=yellow>AVERT.</>  {$label} — {$detail}");
    }

    private function bad(string $label, string $detail): void
    {
        $this->failures++;
        $this->line("  <fg=red>ÉCHEC</>   {$label} — {$detail}");
    }

    public function handle(): int
    {
        $this->info('Moyo — contrôle de configuration (lecture seule)');

        // PHP
        version_compare(PHP_VERSION, '8.2.0', '>=') ? $this->good('PHP', PHP_VERSION) : $this->bad('PHP', PHP_VERSION.' < 8.2 requis');
        $missing = array_filter(['mbstring', 'openssl', 'pdo', 'fileinfo', 'tokenizer', 'xml', 'ctype', 'curl'], fn ($e) => ! extension_loaded($e));
        $missing ? $this->bad('Extensions PHP', 'manquantes : '.implode(', ', $missing)) : $this->good('Extensions PHP');

        // Environment
        config('app.env') === 'production' ? $this->good('APP_ENV', 'production') : $this->caution('APP_ENV', 'vaut « '.config('app.env').' » (production attendu sur le serveur)');
        config('app.debug') === false ? $this->good('APP_DEBUG', 'false') : $this->bad('APP_DEBUG', 'doit être false en production (les erreurs afficheraient des détails)');
        config('app.key') ? $this->good('APP_KEY', 'définie (valeur non affichée)') : $this->bad('APP_KEY', 'vide : php artisan key:generate --force (une seule fois)');
        $url = (string) config('app.url');
        str_starts_with($url, 'https://') ? $this->good('APP_URL', $url) : $this->caution('APP_URL', "« {$url} » n'est pas en https://");
        config('app.timezone') === 'UTC' ? $this->good('APP_TIMEZONE', 'UTC (dates stockées sans décalage)') : $this->caution('APP_TIMEZONE', 'devrait être UTC (voir .env.example)');
        $host = parse_url($url, PHP_URL_HOST);
        str_contains(implode(',', (array) config('sanctum.stateful')), (string) $host)
            ? $this->good('SANCTUM_STATEFUL_DOMAINS', "contient {$host}") : $this->bad('SANCTUM_STATEFUL_DOMAINS', "ne contient pas {$host} : la connexion par cookie échouera");
        (config('session.secure') === true || ! str_starts_with($url, 'https://')) ? $this->good('SESSION_SECURE_COOKIE') : $this->caution('SESSION_SECURE_COOKIE', 'devrait être true derrière HTTPS');
        config('mail.default') === 'log' ? $this->caution('E-mails', 'MAIL_MAILER=log : aucun e-mail réel (réinitialisation de mot de passe inopérante)') : $this->good('E-mails', config('mail.default'));

        // Database
        $driver = config('database.default');
        if ($driver === 'mysql' || $driver === 'mariadb') {
            $this->good('Base de données', "pilote {$driver}");
        } elseif (config('app.env') === 'production') {
            $this->caution('Base de données', "pilote « {$driver} » : MySQL est prévu sur Hostinger (voir docs/DB_MIGRATION.md)");
        } else {
            $this->good('Base de données', "pilote {$driver} (développement)");
        }
        try {
            DB::connection()->getPdo();
            $this->good('Connexion à la base', DB::connection()->getDatabaseName() ? 'établie' : '');
            $files = collect(File::files(database_path('migrations')))->map(fn ($f) => $f->getFilenameWithoutExtension());
            if (! Schema::hasTable('migrations')) {
                $this->bad('Migrations', "table absente : php artisan migrate --force (après sauvegarde)");
            } else {
                $done = DB::table('migrations')->pluck('migration');
                $pending = $files->diff($done);
                $pending->isEmpty() ? $this->good('Migrations', $done->count().' appliquées') : $this->bad('Migrations', $pending->count().' en attente : php artisan migrate --force');
            }
            if (Schema::hasTable('exercises')) {
                Exercise::count() > 0 ? $this->good('Catalogues', Exercise::count().' exercices') : $this->caution('Catalogues', 'vides : php artisan db:seed --force');
            }
        } catch (\Throwable $e) {
            $this->bad('Connexion à la base', 'impossible ('.class_basename($e).') : vérifiez DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD');
        }

        // Frontend build served by Laravel
        $manifest = public_path('build/manifest.json');
        if (! is_file($manifest)) {
            $this->bad('Build Vite', 'public/build/manifest.json absent (compilez en local et téléversez/commitez public/build)');
        } else {
            $m = json_decode((string) file_get_contents($manifest), true) ?: [];
            $missingFiles = [];
            foreach ($m as $entry) {
                foreach (array_merge([$entry['file'] ?? null], $entry['css'] ?? []) as $f) {
                    if ($f && ! is_file(public_path('build/'.$f))) {
                        $missingFiles[] = $f;
                    }
                }
            }
            $missingFiles ? $this->bad('Build Vite', count($missingFiles).' fichier(s) du manifeste manquant(s)') : $this->good('Build Vite', count($m).' entrées, fichiers présents dans public/build');
        }
        is_file(resource_path('views/app.blade.php')) ? $this->good('Vue de l\'application') : $this->bad('Vue de l\'application', 'resources/views/app.blade.php absente');

        // Permissions and exposure
        foreach (['storage/logs', 'storage/framework/cache', 'storage/framework/sessions', 'storage/framework/views', 'bootstrap/cache'] as $d) {
            is_writable(base_path($d)) ? null : $this->bad('Droits d\'écriture', "{$d} n'est pas modifiable par PHP");
        }
        $this->failures === 0 ? $this->good('Droits d\'écriture', 'storage et bootstrap/cache') : null;
        foreach (['.env', 'composer.json', 'artisan'] as $f) {
            if (is_file(public_path($f))) {
                $this->bad('Fichiers privés', "public/{$f} est dans le dossier public !");
            }
        }
        $this->good('Fichiers privés', "aucun .env ni code source dans public/ (vérifiez aussi l'URL /.env : 403/404 attendu)");

        $this->newLine();
        $this->line("Résultat : {$this->failures} échec(s), {$this->warnings} avertissement(s).");

        return ($this->failures > 0 || ($this->option('strict') && $this->warnings > 0)) ? self::FAILURE : self::SUCCESS;
    }
}

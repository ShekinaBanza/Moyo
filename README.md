# Moyo — compagnon santé et habitudes

Application de suivi personnel (sommeil, repas adaptés à la RDC, activité, mesures corporelles, symptômes, habitudes), **utilisable sans montre**, multi-utilisateur, installable (PWA).
Backend Laravel 12 + MySQL, frontend React + TypeScript compilé par Vite et servi par Laravel sur le même domaine.

> Moyo observe des habitudes. Elle ne pose aucun diagnostic et ne remplace pas un professionnel de santé.

## Pile technique (choix justifiés)

| Élément | Choix | Raison |
|---|---|---|
| Backend | Laravel 12.x, PHP ≥ 8.2 | Compatible avec PHP 8.2–8.4 proposés par Hostinger ; testé en local sous PHP 8.5 |
| Auth | Sanctum, session cookie + CSRF (SPA même domaine) | Aucun jeton permanent dans le navigateur |
| BDD | MySQL (prod), SQLite en mémoire (tests) | |
| Frontend | React 19, TypeScript, Tailwind 4, Recharts, Vite 8 | Compilé en statique dans `public/build` : pas de serveur Node en production |
| PWA | `public/manifest.webmanifest`, `public/service-worker.js` | Cache limité aux ressources publiques |

## Installation locale

Prérequis : PHP ≥ 8.2 (extensions `mbstring`, `openssl`, `pdo_mysql` ou `pdo_sqlite`, `fileinfo`, `tokenizer`, `xml`, `ctype`), Composer 2, Node ≥ 20.

```bash
composer install
cp .env.example .env
php artisan key:generate
# Éditez .env : DB_* (MySQL XAMPP) ou DB_CONNECTION=sqlite avec database/database.sqlite
php artisan migrate --seed
npm ci
npm run build
php artisan serve --port=8000
```

Ouvrir http://localhost:8000. En développement du frontend : `npm run dev` dans un second terminal.
Le seeder ne crée **que** les catalogues (aliments, activités, exercices et 5 modèles de séances) : aucun utilisateur ni donnée de santé de démonstration.

## Commandes de test

```bash
php artisan test      # backend : 109 tests (isolation multi-comptes, sécurité, sommeil, sync, règles médicales, énergie, GPS, notifications, exercices, montre)
npm run typecheck     # TypeScript
npm test              # frontend : 32 tests (file d'attente hors ligne, formats, GPS, séance minutée, décodeurs Bluetooth, programmes)
npm run build         # typecheck + build de production
```

## Structure

- `app/Http/Controllers/Api/` — contrôleurs fins ; `OwnedCrudController` impose propriétaire = utilisateur authentifié.
- `app/Services/` — `SleepDurationCalculator`, `SafetyService` (règles versionnées), `MeasurementSyncService`, `MeasurementValidator`, `TrendService`, `AccountExportService`, `AuditLogger`.
- `app/Policies/OwnedPolicy.php` — politique unique « seul le propriétaire ».
- `routes/api.php` (`/api/v1`, protégé `auth:sanctum`) et `routes/web.php` (auth session + SPA).
- `resources/js/` — `pages/`, `components/`, `hooks/`, `lib/` (`api`, `offline`, `ble`), `layouts/`, `types/`.
- `public/images/` — illustrations et images d'aliments SVG originales, locales ; `public/icons/` — icônes PWA.

## Documentation

- [docs/DEPLOY_HOSTINGER.md](docs/DEPLOY_HOSTINGER.md) — déploiement
- [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) — sauvegarde et restauration
- [docs/SECURITY.md](docs/SECURITY.md) — rapport de sécurité
- [docs/SAFETY_RULES.md](docs/SAFETY_RULES.md) — règles de sécurité médicale (v1)
- [docs/OFFLINE.md](docs/OFFLINE.md) — PWA et hors ligne
- [docs/WATCH_BLE.md](docs/WATCH_BLE.md) — montre Remax Watch8, état technique
- [docs/EXERCISES.md](docs/EXERCISES.md) — exercices, séances minutées, sécurité, calories
- [docs/ENERGY.md](docs/ENERGY.md) — bilan énergétique, formules, limites
- [docs/GPS.md](docs/GPS.md) — carte, trajets, vie privée, limites d'une PWA
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) — rappels, cron, Web Push
- [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) — rapport final : terminé / testé / partiel / non vérifié

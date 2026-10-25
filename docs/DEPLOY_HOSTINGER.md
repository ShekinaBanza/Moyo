# Déploiement sur Hostinger Business Web Hosting

Hébergement **mutualisé** (pas de VPS). Rien ci-dessous n'a été exécuté sur votre hébergement : ce sont des étapes à dérouler et à vérifier dans hPanel.

## 0. À vérifier dans hPanel

- Version PHP : **8.2, 8.3 ou 8.4** (Laravel 12 exige ≥ 8.2). Avancé → Configuration PHP.
- Extensions : `mbstring`, `openssl`, `pdo_mysql`, `fileinfo`, `tokenizer`, `xml`, `ctype`, `curl`, `zip`, `intl` (recommandé).
- Accès SSH activé (Avancé → Accès SSH) et Composer 2 (`composer2 --version`).
- SSL actif (Sécurité → SSL) et « Forcer HTTPS ».
- Base MySQL créée (Bases de données → Gestion) : notez nom, utilisateur, mot de passe (ne les envoyez à personne).
- Possibilité de changer la racine documentaire du domaine (voir §2).

## 0 bis. Déploiement depuis GitHub (dépôt https://github.com/ShekinaBanza/Moyo)

Rien n'est déployé automatiquement par GitHub : il faut le configurer côté Hostinger.
- Les fichiers compilés (`public/build/`) **sont versionnés** (l'hébergement mutualisé n'a pas Node.js) : après tout changement du frontend, lancez `npm run build` en local et committez `public/build`.
- `composer.lock` est résolu pour **PHP 8.2** (`config.platform.php = 8.2.0`) : il s'installe sur PHP 8.2, 8.3, 8.4 (testé en local sous 8.5).
- Option 1 — SSH : `git clone https://github.com/ShekinaBanza/Moyo.git ~/moyo`, puis suivre §4. Mises à jour : `git pull` + §5.
- Option 2 — hPanel → Avancé → **Git** : relier le dépôt et choisir le dossier de déploiement ; le dossier public du site doit rester `public/` (§2).
- Option 3 — sans SSH : téléverser par le Gestionnaire de fichiers une archive du projet incluant `vendor/` (créée en local avec `composer install --no-dev --optimize-autoloader`) et `public/build/`.
- Le dépôt est privé ou public : dans tous les cas, **aucun `.env`** n'y figure ; créez-le sur le serveur (§3).

## 1. Compiler le frontend (en local)

```bash
npm ci
npm run build          # produit public/build/
```
Node n'est pas nécessaire en production : on téléverse `public/build/`.

## 2. Structure de fichiers — deux options

**Option A (idéale)** : la racine documentaire du domaine (ou d'un sous-domaine) pointe sur le dossier `public/` de Laravel. Placez le projet dans `~/moyo/` et configurez la racine sur `~/moyo/public`. Seul `public/` est exposé.

**Option B (si la racine reste `public_html`)** : n'exposez jamais le code Laravel.
1. Envoyez tout le projet **hors** de `public_html`, par ex. `~/moyo/` (contient `app/`, `.env`, `vendor/`, `storage/`…).
2. Copiez le **contenu** de `~/moyo/public/` dans `~/public_html/` (y compris `build/`, `images/`, `icons/`, `.htaccess`, `manifest.webmanifest`, `service-worker.js`, `offline.html`).
3. Dans `~/public_html/index.php`, remplacez les deux chemins :
```php
require __DIR__.'/../moyo/vendor/autoload.php';
$app = require_once __DIR__.'/../moyo/bootstrap/app.php';
```
4. Après chaque `npm run build`, recopiez `public/build/` vers `public_html/build/`.
5. Contrôle : `https://votre-domaine/.env`, `/composer.json`, `/storage/logs/laravel.log` doivent répondre **404/403**.

Ne copiez pas aveuglément tout Laravel dans `public_html`.

## 3. Configuration (`.env` créé **sur le serveur**, jamais dans Git)

```
APP_NAME="Moyo"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://votre-domaine.com
# Les dates sont STOCKÉES en UTC (évite tout décalage). Le fuseau de chaque utilisateur (défaut Africa/Kinshasa)
# est un réglage de profil : il sert à l'affichage, aux jours et aux rappels.
APP_TIMEZONE=UTC
APP_LOCALE=fr
APP_FALLBACK_LOCALE=en

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=<nom_base_hpanel>
DB_USERNAME=<utilisateur_hpanel>
DB_PASSWORD=<mot_de_passe_hpanel>

SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=votre-domaine.com
LOG_LEVEL=warning

# E-mails (réinitialisation du mot de passe) — à configurer avec un vrai SMTP (hPanel → E-mails)
MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_USERNAME=<adresse>
MAIL_PASSWORD=<mot_de_passe_mail>
MAIL_FROM_ADDRESS=<adresse>
```
Sans SMTP réel, la réinitialisation de mot de passe **n'envoie rien** (le mailer `log` n'écrit que dans un fichier).

## 4. Première installation (SSH)

```bash
cd ~/moyo
composer2 install --no-dev --optimize-autoloader
php artisan key:generate --show   # copiez la valeur dans .env (APP_KEY=) UNE SEULE FOIS ; ne la régénérez plus
```
Puis, **après sauvegarde de la base** (voir BACKUP_RESTORE.md) :
```bash
php artisan migrate --force
php artisan db:seed --force   # catalogues d'aliments et d'activités uniquement (aucun utilisateur)
chmod -R u+rwX,go-rwx storage bootstrap/cache
php artisan config:cache && php artisan route:cache && php artisan view:cache
```
N'exécutez pas `storage:link` : aucune donnée de santé ne doit être publique, et l'application n'en a pas besoin.

## 5. Mises à jour

1. Sauvegarde de la base. 2. Téléversement du code + `public/build/`. 3. `composer2 install --no-dev --optimize-autoloader`. 4. `php artisan migrate --force`. 5. `php artisan optimize:clear && php artisan config:cache && php artisan route:cache`. 6. Augmentez `VERSION` dans `public/service-worker.js` pour purger les anciens caches.

## 6. Tâches planifiées (recommandées, non obligatoires)

Aucune file d'attente (`queue`) n'est requise. Une tâche cron **chaque minute** — `php /chemin/vers/moyo/artisan schedule:run` — génère les rappels même quand personne n'ouvre l'application et supprime les points GPS de plus de 90 jours. Sans cron, les rappels sont créés à l'ouverture de l'application. Détails, VAPID (notifications du navigateur) : docs/NOTIFICATIONS.md. Fond de carte et conditions d'usage : docs/GPS.md (variables de build `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION`).

## 7. Vérifications après déploiement

- `https://domaine/up` répond 200 ; la page d'accueil charge ; HTTPS actif, pas de contenu mixte.
- Création de compte, connexion, saisie d'un repas, déconnexion, reconnexion : la saisie est toujours là.
- Fichiers privés inaccessibles (voir §2.5). `APP_DEBUG=false` : une erreur ne montre aucune trace.
- Documentation officielle : https://laravel.com/docs/12.x/deployment — https://www.hostinger.com/support/5792078-how-to-use-composer-at-hostinger/

---

## Mise en ligne pas à pas — https://rosybrown-giraffe-981859.hostingersite.com/

État constaté (25 oct. 2026) : le domaine répond avec la **page par défaut de Hostinger** : rien n'est encore déployé. Le déploiement n'a pas été fait depuis cet environnement (aucun accès à hPanel, SSH ou FTP : ces accès ne doivent pas être partagés en conversation).

Un paquet prêt à envoyer est généré localement : `deploy/moyo-hostinger-upload.zip` (9 Mo, **sans `.env`**, dépendances de production installées pour PHP 8.2+, `public/build` compilé). Il n'est pas versionné (régénérable : `git archive HEAD`, `composer install --no-dev --optimize-autoloader`, zip). Sa mise en route a été vérifiée en local (99 routes, `/up` et `/` répondent 200) — **pas sur Hostinger**.

### A. Dans hPanel (Sites → ce site)
1. **PHP** : Avancé → Configuration PHP → version **8.2, 8.3 ou 8.4** ; extensions : `mbstring, openssl, pdo_mysql, fileinfo, tokenizer, xml, ctype, curl, zip` (+ `intl` conseillée).
2. **SSL** : activé et « Forcer HTTPS ».
3. **Base MySQL** : Bases de données → créer ; noter nom, utilisateur, mot de passe.
4. **Racine documentaire** : si hPanel permet de la changer, la pointer vers `…/moyo/public` (Option A). Sinon, utiliser la disposition B ci-dessous.

### B. Envoi des fichiers (sans SSH)
1. Gestionnaire de fichiers → créer le dossier `moyo` **à côté** de `public_html` (au niveau du compte, pas dedans).
2. Envoyer `moyo-hostinger-upload.zip` dans `moyo/` puis « Extraire ». Vérifier que `moyo/artisan`, `moyo/vendor`, `moyo/public/build` existent.
3. Disposition B uniquement : copier le **contenu** de `moyo/public/` dans `public_html/`, puis remplacer `public_html/index.php` par `moyo/deploy/hostinger/index.php` (il charge `../moyo`).
4. Créer `moyo/.env` (modèle ci-dessous) via le Gestionnaire de fichiers.

### C. `.env` de production (à créer sur le serveur, jamais dans Git)
Le modèle complet et commenté est **`.env.example`** du dépôt (déjà réglé pour la production : `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL`, français, MySQL, sessions/cache en base, file d'attente `sync`, cookies sécurisés, domaine Sanctum). Sur le serveur : copiez-le en `.env`, puis renseignez **uniquement** ces valeurs, lues dans hPanel :

| Variable | Où la trouver |
|---|---|
| `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | hPanel → Bases de données → Gestion (créer la base et l'utilisateur ; `DB_HOST=localhost` sauf indication contraire affichée) |
| `APP_KEY` | générée par `php artisan key:generate --force` (une seule fois) |
| `MAIL_*` (facultatif) | hPanel → E-mails (sinon aucun e-mail n'est envoyé) |
| `VAPID_*` (facultatif) | `php artisan webpush:vapid` |

Le fichier `.env` doit rester **hors de la racine web** (dans le dossier du projet, pas dans `public/` ni `public_html/`) ; vérifiez que `https://…/.env` répond 403/404. Ci-dessous, un exemple équivalent :
```
APP_NAME="Moyo"
APP_ENV=production
APP_DEBUG=false
APP_KEY=                      # voir D.1 : à générer UNE seule fois
APP_URL=https://rosybrown-giraffe-981859.hostingersite.com
APP_TIMEZONE=UTC
APP_LOCALE=fr
APP_FALLBACK_LOCALE=en
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=<nom_base_hpanel>
DB_USERNAME=<utilisateur_hpanel>
DB_PASSWORD=<mot_de_passe_hpanel>

SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=rosybrown-giraffe-981859.hostingersite.com
CACHE_STORE=database
QUEUE_CONNECTION=sync
```
(SMTP et clés VAPID : voir docs/NOTIFICATIONS.md ; facultatifs.)

### D. Initialisation (terminal SSH de hPanel, ou « Exécuter une commande » si disponible)
1. `cd ~/moyo && php artisan key:generate --force` — **une seule fois** (si `APP_KEY` est vide). Ne jamais le refaire ensuite.
2. **Sauvegarde** de la base (phpMyAdmin → Exporter) — la base est neuve : cette étape devient indispensable pour toute mise à jour.
3. `php artisan migrate --force` puis `php artisan db:seed --force` (catalogues aliments, activités, exercices et modèles ; aucun utilisateur).
4. `chmod -R u+rwX storage bootstrap/cache` puis `php artisan config:cache && php artisan route:cache`.
Sans SSH : demander l'exécution de ces commandes au support Hostinger, ou importer le schéma via phpMyAdmin depuis une base locale MySQL migrée (`php artisan migrate --seed` en local sur MySQL, puis export SQL) — dans ce cas, la clé `APP_KEY` doit être générée localement et copiée dans le `.env` serveur.

### E. Tâche cron (facultative, pour les rappels)
Avancé → Tâches Cron → chaque minute : `php /home/<compte>/moyo/artisan schedule:run`.

### F. Vérifications à faire après la mise en ligne
`/up` → 200 ; accueil, inscription, connexion ; `/.env`, `/composer.json`, `/storage/logs/laravel.log` → 403/404 ; enregistrer un repas et une activité ; GPS (autorisation du navigateur, HTTPS) ; page « Ma montre » sur Chrome Android ; installation PWA ; deux comptes : isolement ; aucune trace d'erreur affichée (`APP_DEBUG=false`).

---

## Dépannage : « le déploiement attend un dossier `dist` » (build réussi mais déploiement en échec)

**Symptôme** : le journal Hostinger montre `tsc --noEmit` réussi, `vite build` terminé (2 562 modules) puis une erreur car `dist` n'existe pas.

**Cause confirmée** : Moyo est une application **Laravel complète** (PHP + Vite). Vite écrit volontairement dans `public/build` (avec `public/build/manifest.json`) car `@vite(...)` dans `resources/views/app.blade.php` lit ce manifeste. Hostinger a détecté `package.json`/Vite et a configuré le dépôt comme un **site frontend statique** (« Node.js / framework JavaScript ») dont le dossier de sortie par défaut est `dist`. Ce n'est pas un défaut du code : le build fonctionne.

**À ne pas faire** : changer `build.outDir` vers `dist` (la vue Laravel ne trouverait plus le manifeste → page blanche), créer un `dist` vide ou y copier des fichiers (le site statique n'aurait ni PHP, ni API, ni base de données).

**Correction (panneau Hostinger, pas le dépôt)** — au choix :
1. **Recommandé** : déployer comme **site PHP** et non comme application frontend/Node : hPanel → *Sites* → site concerné → *Avancé → Git* (ou *Gestionnaire de fichiers/SSH*), cloner `https://github.com/ShekinaBanza/Moyo.git` branche **`main`**, et suivre la section « Mise en ligne pas à pas ». Le dossier public du site doit être `…/public` (ou la disposition `public_html` décrite dans `deploy/hostinger/README.md`). Aucune étape de build n'est nécessaire sur Hostinger : `public/build` est déjà versionné et `composer install --no-dev` suffit.
2. Si le site a été créé comme « application web Node.js/frontend » : le supprimer ou créer un nouveau site PHP/Laravel, puis relier le même dépôt.
3. Si l'option frontend doit absolument être gardée : désactiver la commande de build et définir le dossier de sortie sur `public` (qui contient `build/`, `index.php` ne sera pas exécuté en statique : l'application ne fonctionnera pas). Ce cas n'est donc **pas** recommandé.

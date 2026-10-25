# Hostinger : disposition de fichiers sans changer la racine documentaire

```
~/moyo/                  <- projet Laravel complet (app, vendor, .env, storage...) : NON accessible depuis le web
~/public_html/           <- uniquement le contenu de moyo/public/ (+ ce index.php à la place de celui de Laravel)
    index.php            <- deploy/hostinger/index.php
    .htaccess            <- celui de public/.htaccess
    build/  images/  icons/  manifest.webmanifest  service-worker.js  offline.html  robots.txt  favicon.ico
```
Après chaque `npm run build`, recopier `public/build/` vers `public_html/build/`.
Vérifier que `https://votre-domaine/.env`, `/composer.json` et `/storage/logs/laravel.log` répondent 403/404.
Voir docs/DEPLOY_HOSTINGER.md.

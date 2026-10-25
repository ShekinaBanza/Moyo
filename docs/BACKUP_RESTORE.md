# Sauvegarde et restauration

## Quoi sauvegarder

| Élément | Pourquoi |
|---|---|
| Base MySQL | Toutes les données de santé |
| `.env` (copie chiffrée, stockée à part) | Contient `APP_KEY` ; sans elle les sessions et valeurs chiffrées deviennent illisibles |
| Code + `public/build/` | Redéployable depuis votre machine |

## Sauvegarde de la base

hPanel → Bases de données → phpMyAdmin → Exporter (format SQL), ou en SSH :
```bash
mysqldump --single-transaction -u <utilisateur> -p <base> > moyo-$(date +%F).sql
```
Faites-la **avant chaque `migrate`**. Les sauvegardes contiennent des données de santé : stockez-les chiffrées (ex. `gpg -c fichier.sql`), hors de `public_html`, et supprimez les anciennes. Hostinger propose aussi des sauvegardes automatiques (à vérifier dans hPanel) : ne vous y fiez pas comme unique copie.

## Restauration

1. Mettre le site en maintenance : `php artisan down`.
2. Importer le SQL : phpMyAdmin → Importer, ou `mysql -u <utilisateur> -p <base> < moyo-AAAA-MM-JJ.sql`.
3. Restaurer le `.env` d'origine si nécessaire (même `APP_KEY`).
4. `php artisan migrate --status` puis `php artisan optimize:clear`.
5. `php artisan up` et tester une connexion.

Faites un essai de restauration sur une base vide au moins une fois : une sauvegarde jamais restaurée n'est pas vérifiée. (Cet essai n'a **pas** été réalisé sur votre hébergement.)

## Export par l'utilisateur

Chaque utilisateur peut télécharger ses données (Profil → Exporter, JSON) : `POST /api/v1/account/export`.

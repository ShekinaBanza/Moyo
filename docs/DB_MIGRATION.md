# Base de données : MySQL en production, migration depuis SQLite

## Qui utilise quoi
| Environnement | Base | Pourquoi |
|---|---|---|
| Production (Hostinger) | **MySQL** (hPanel → Bases de données) | robuste en écriture concurrente, sauvegardable depuis hPanel |
| Tests automatisés | SQLite en mémoire (`phpunit.xml`) | rapide, jetable |
| Développement local | MySQL XAMPP ou SQLite (`.env.local.example`) | au choix |

Le code est identique pour les deux (migrations Laravel portables). **Rien n'est migré automatiquement** : aucune commande ne supprime de base, aucune ne tourne sans que vous la lanciez.

## Cas 1 — vous n'avez que des données de test (le plus probable)
Ne migrez rien : créez la base MySQL vide sur Hostinger, puis `php artisan migrate --force` et `php artisan db:seed --force`. Les comptes de test locaux ne sont pas repris ; créez un vrai compte sur le site.

## Cas 2 — vous voulez conserver les données réelles d'un fichier SQLite
Commande fournie : `php artisan moyo:copy-from-sqlite <fichier.sqlite>` (**simulation par défaut**).

1. **Sauvegardes (obligatoires)**
   - copiez le fichier SQLite (`database/database.sqlite`) à un endroit sûr, hors du dossier public ;
   - exportez la base MySQL cible si elle contient déjà quelque chose (phpMyAdmin → Exporter).
2. **Préparer la cible** (base MySQL vide, `.env` du serveur renseigné) : `php artisan migrate --force` puis `php artisan db:seed --force`. Les catalogues (aliments, activités, exercices, modèles) doivent avoir les **mêmes identifiants** que dans la source : c'est le cas si la source a été créée avec les mêmes seeders sur une base neuve. Sinon la commande refuse (« Catalogue … a l'id … »).
3. **Téléverser** le fichier SQLite sur le serveur (hors `public_html`), par exemple `~/moyo/storage/app/private/ancien.sqlite`.
4. **Simulation** : `php artisan moyo:copy-from-sqlite storage/app/private/ancien.sqlite` — affiche, table par table, le nombre de lignes source et cible, **n'écrit rien**.
5. **Copie** : `php artisan moyo:copy-from-sqlite storage/app/private/ancien.sqlite --execute`.
   - une seule transaction : en cas de moindre écart de comptage ou d'erreur, **tout est annulé** ;
   - refuse si la cible contient déjà des données utilisateur (aucun écrasement, aucun doublon) ;
   - ne copie pas les catalogues ni les modèles (déjà semés), ni les sessions, caches et jetons ;
   - ne modifie jamais le fichier source.
6. **Vérification** : la commande contrôle les comptages ; ensuite connectez-vous avec un compte migré (même e-mail et même mot de passe qu'avant, les mots de passe sont copiés tels quels), ouvrez le tableau de bord, les repas, le sommeil et le bilan. `php artisan moyo:check` doit afficher 0 échec.
7. **Après** : conservez le fichier SQLite et les sauvegardes quelques semaines, puis supprimez le fichier du serveur (données de santé).

Limites : les dates sont copiées telles quelles (déjà en UTC) ; les clés d'abonnement push et les sessions ne sont pas reprises (réabonnement nécessaire) ; testé uniquement SQLite → SQLite en test automatisé, pas encore SQLite → MySQL réel (à valider sur une copie).

## Rester en SQLite sur Hostinger : possible mais déconseillé
Si vous insistez : `DB_CONNECTION=sqlite` et `DB_DATABASE=/home/<compte>/moyo/database/database.sqlite` (chemin absolu), l'extension `pdo_sqlite` active, le **fichier et son dossier modifiables par PHP**, le fichier hors de `public_html`, et une sauvegarde régulière du fichier. Inconvénients : écritures concurrentes limitées, pas de sauvegarde automatique hPanel de la base, risque de perte si le dossier est écrasé lors d'un déploiement. `php artisan moyo:check` avertit en production si le pilote n'est pas MySQL.

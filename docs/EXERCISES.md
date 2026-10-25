# Exercices physiques

Pages : `/app/exercises` (accueil), `/app/exercises/list?category=…`, `/app/exercises/{slug}` (fiche), `/app/exercises/programs` (Mes programmes), `/app/exercises/run` (séance minutée), `/app/exercises/progress` (Ma progression).
Code : `app/Services/WorkoutService.php`, `Api/ExerciseController`, `Api/WorkoutProgramController`, `Api/WorkoutSessionController`, `database/seeders/ExerciseSeeder.php`, `resources/js/lib/workoutRunner.ts` (machine à états), `lib/exercises.ts`.

## Contenu du catalogue (réel, partagé)
29 exercices : **musculation** (pectoraux, dos, épaules, biceps/triceps, jambes, fessiers), **renforcement général** (corps entier), **abdominaux** (crunch, dead bug, gainage ventral et latéral, bird dog, relevés de genoux) et **mobilité/étirements**. Chaque fiche contient : image de départ et d'arrivée, muscles, niveau, matériel (sans matériel, haltères, élastiques, chaise, mur, salle), étapes, respiration, erreurs fréquentes, précautions, variante plus facile et séries/répétitions/repos **conseillés pour les 3 niveaux**. Ces valeurs sont des **points de départ habituels, pas des prescriptions** ; elles ne sont jamais augmentées automatiquement. Aucune charge lourde n'est imposée ; le matériel est un filtre.
Le texte des exercices a été rédigé pour Moyo (conseils généraux de technique) : **à faire relire par un éducateur sportif ou un kinésithérapeute** avant un usage large.

## Images
Illustrations **originales** générées par `scripts/make-figures.mjs` (mannequin dessiné à partir de coordonnées articulaires) : `public/images/exercises/{slug}-start.svg` / `-end.svg`, 4 couvertures de catégories, 1 bannière, et les 17 pictogrammes d'activités (`public/images/activities/`). Aucune photo ni image de banque d'images n'est utilisée ou copiée (voir ci-dessous). Les SVG sont légers (≈ 1–2 ko), chargés en différé, avec texte alternatif ; un visuel de remplacement local (`banner.svg`) s'affiche si un fichier manquait. Un test vérifie que chaque exercice a ses deux images sur disque.
Ce sont des **illustrations stylisées**, pas des planches anatomiques exactes : la posture est schématique.

**Icônes iStock demandées** : les images d'iStock sont des œuvres sous licence payante (filigrane, usage soumis à achat) : elles ne peuvent être ni copiées ni intégrées sans licence. Les personnages ont à la place été redessinés avec un style cohérent et original. Si vous voulez des icônes issues d'une bibliothèque, des sources gratuites compatibles avec un usage dans une application existent (Lucide — déjà utilisée —, Tabler Icons, Phosphor, OpenMoji sous CC BY-SA) : indiquez-moi lesquelles et je les intègre en respectant leur licence et l'attribution.

## Sécurité médicale (côté serveur)
`WorkoutService::access()` réutilise les règles `safety-rules-v1` (docs/SAFETY_RULES.md) :
- **open** : tout est disponible ;
- **restricted** (essoufflement ou gonflement notés récemment, ou symptôme d'alerte dans les 30 jours sans évaluation professionnelle déclarée) : **uniquement mobilité/étirements**, pas de musculation, d'abdominaux exigeants ni de progression, avec message de réévaluation médicale ;
- **blocked** (douleur thoracique, évanouissement, essoufflement important au repos) : aucune séance, message d'urgence.
Le serveur **refuse** l'enregistrement d'une séance hors des catégories autorisées (403 `exercise_restricted` / `exercise_blocked`) ; l'interface verrouille les catégories et le démarrage. Les mesures d'une montre ne peuvent pas lever ces restrictions. La séance permet de **raccourcir**, d'**alléger** (−1 série, −2 répétitions/−10 s), de mettre en pause et d'arrêter ; une bande permanente rappelle d'arrêter en cas de douleur, vertige ou essoufflement anormal, avec un bouton « Je ne me sens pas bien ».

## Séance minutée
Machine à états pure, testée : les compte à rebours sont calculés à partir d'horodatages (pas de progression simulée), la pause gèle le chrono et la durée effective, le repos et les séries chronométrées se terminent d'eux-mêmes. Boutons : série terminée (avec compteur de répétitions réellement faites), passer le repos, précédent/suivant, pause/reprendre, terminer. Écran maintenu allumé si le navigateur le permet. Vérifié dans le navigateur avec une séance de 26 s (décompte 5→3 s, pause figée, passage automatique repos → exercice suivant).

## Historique, progression
`workout_sessions` + `workout_session_exercises` : date, programme, exercices, **séries et répétitions réellement saisies**, durée effective, difficulté ressentie, notes, estimation de calories. Les graphiques (séances/semaine, minutes/semaine, performance par exercice) sont calculés **uniquement** à partir de ces enregistrements ; sans donnée, un état vide explique quoi faire. Une séance enregistrée hors ligne est conservée sur l'appareil (outbox) jusqu'à confirmation du serveur.

## Calories et bilan énergétique
- Estimation **nette** (au-dessus du repos) = `(MET − 1) × 3,5 × poids ÷ 200 × minutes`, avec un MET moyen **par catégorie** de séance (musculation 3,5 ; abdominaux 3,8 ; mobilité 2,3 ; renforcement général 5,0 — valeurs indicatives du Compendium, non revérifiées, voir docs/ENERGY.md). Minutes = durée effective arrondie au-dessus ; poids = dernière pesée avant la séance. Sans poids : « non estimable », aucun chiffre inventé. La méthode est enregistrée avec la séance et affichée.
- **Rien n'est ajouté au journal sans clic** (« Ajouter à mon journal d'activités »). Une séance ne peut être ajoutée qu'une fois.
- **Double comptage** : si une activité enregistrée se chevauche avec la séance, le serveur répond `possible_duplicate` et l'utilisateur choisit : *Remplacer* (supprime seulement les entrées **manuelles**), *Garder les deux* ou *Ne rien ajouter*. Les activités issues du GPS ou d'une montre ne sont jamais remplacées automatiquement. Les calories d'une montre ne sont de toute façon pas utilisées (docs/ENERGY.md).

## API
`GET /exercises`, `GET /exercises/{slug}`, `GET /exercises/access`, `GET|POST /workout-programs`, `GET|PATCH|DELETE /workout-programs/{id}`, `POST /workout-programs/{id}/duplicate`, `GET|POST /workout-sessions`, `GET|PATCH|DELETE /workout-sessions/{id}`, `POST /workout-sessions/{id}/log-activity`. Catalogue et modèles : lecture seule pour tous (modifier = dupliquer). Programmes et séances : strictement privés (404 pour un autre compte, testé).

## Limites
Catalogue de départ (29 exercices) : pas de vidéos ; pas de planification automatique ni de rappel par jour sans votre accord ; aucune progression automatique des charges ; pas de reconnaissance de la posture.

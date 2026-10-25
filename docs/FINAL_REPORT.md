# Rapport final — Moyo (25 octobre 2026)

Audit initial : dépôt **vide** (aucun code à préserver). Pile retenue : Laravel 12.70 (PHP ≥ 8.2, compatible Hostinger 8.2–8.4), Sanctum session, React 19 + TypeScript, Vite 8, Tailwind 4. Référence MoBuzz : la page d'accueil `mobuzz.cloud` a été consultée (titre en deux tons, badge pilule, boutons arrondis, aperçu de tableau de bord, barres de progression, palette indigo douce). La page « Achat Maison » n'a **pas** été trouvée ; rien n'a été copié, l'identité (Moyo, teal/sable) est originale.

## Tableau d'état

Légende : **Terminé et testé** / Partiel / Non vérifié.

| Fonctionnalité | État réel | Fichiers principaux | Tests effectués | Résultat | Limites |
|---|---|---|---|---|---|
| Inscription, connexion, déconnexion, limitation des essais | Terminé et testé | `Api/AuthController.php`, `pages/AuthPages.tsx` | `AuthTest` (4) + parcours navigateur (inscription) | Réussi | Pas de vérif. e-mail ni 2FA |
| Réinitialisation du mot de passe | Partiel | `AuthController`, `AuthPages.tsx` (Forgot) | Aucun test d'envoi | Non vérifié | Exige un vrai SMTP |
| Isolation multi-utilisateur (IDOR) | Terminé et testé | `OwnedCrudController`, `OwnedPolicy`, `IsolationTest.php` | 7 tests (sommeil, repas, symptômes, mesures, activité, habitudes, appareils, sync, export, invités) | Réussi | — |
| Sommeil (durée au lit vs sommeil, minuit) | Terminé et testé | `SleepDurationCalculator`, `Sleep.tsx` | 4 unitaires + 2 feature | Réussi | Pas de phases de sommeil (aucune source) |
| Alimentation RDC + catalogue + images | Terminé et testé (API) / UI vérifiée visuellement | `FoodEntryController`, `FoodCatalogSeeder`, `Food.tsx` | Feature + capture mobile | Réussi | Aucune valeur nutritionnelle (toutes « inconnues », volontairement) |
| Activité | Terminé et testé (API) / UI vérifiée visuellement | `ActivityEntryController`, `Activity.tsx` | Feature, parcours navigateur via API | Réussi | — |
| Mesures corporelles | Terminé et testé (API) | `BodyMeasurementController`, `Body.tsx` | Feature (validation, idempotence) | Réussi | — |
| Symptômes + historique imprimable | Terminé et testé | `SymptomEntryController`, `Symptoms.tsx` | Feature | Réussi | Export PDF = impression navigateur |
| Règles de sécurité médicale v1 | Terminé et testé | `SafetyService`, `SafetyBanner.tsx`, `docs/SAFETY_RULES.md` | 3 feature + capture du bandeau | Réussi | Seuils non validés cliniquement |
| Tableau de bord (« Non disponible » au lieu de 0) | Terminé et testé | `InsightsController`, `Dashboard.tsx` | Feature + captures | Réussi | — |
| Tendances / graphiques | Terminé, vérifié visuellement | `TrendService`, `Trends.tsx`, `Charts.tsx` | Feature (données réelles) + 5 graphiques rendus à 360 px | Réussi | Régularité calculée dans le fuseau serveur |
| Habitudes & rappels | Partiel | `HabitRecordController`, `ReminderController`, `Dashboard.tsx`, `Profile.tsx` | Habitudes via API ; rappels non testés automatiquement | Partiel | Rappels visibles uniquement app ouverte ; pas de push |
| Consentements, export, suppression de compte | Terminé et testé | `ConsentController`, `AccountController` | Feature | Réussi | — |
| Synchronisation de mesures + traçabilité | Terminé et testé (serveur) | `MeasurementSyncService`, `MeasurementValidator` | Feature (idempotence, rejets, `unverified`/`stale`) | Réussi | Aucun client réel (pas de décodeur) |
| PWA (manifeste, SW, icônes) | Terminé, vérifié dans un navigateur | `public/manifest.webmanifest`, `service-worker.js`, `offline.html` | SW activé, manifeste lu, aucune entrée `/api` en cache | Réussi | Installation sur téléphone non testée |
| Brouillons hors ligne + resynchronisation | Terminé (logique testée) | `lib/offline.ts`, `OutboxPanel.tsx` | 4 tests vitest | Réussi (réseau simulé par script dans le navigateur) | Coupure réseau réelle non testée |
| Images et illustrations (SVG originaux) | Terminé et testé | `public/images/**`, `public/icons/**` | 0 image cassée sur 9 pages à 360 px | Réussi | Illustrations simples |
| Responsive / pas de débordement horizontal | Terminé et testé | `layouts/AppLayout.tsx` | 9 pages à 360 px ; landing à 390 et 1440 px | Réussi à 360, 390, 768, 1024, 1440 px | — |
| Accessibilité | Partiel | `components/ui.tsx` | Labels, focus, tableaux de données cachés, `prefers-reduced-motion` ; aucun audit outillé | Non audité | Pas de test lecteur d'écran |
| Appareils + prototype BLE | Partiel (prototype) | `DeviceController`, `lib/ble.ts`, `Devices.tsx` | Gestion d'appareils testée ; BLE **non exécuté** | BLE non vérifié | Protocole Watch8 non décodé (voir WATCH_BLE.md) |
| Montre Remax Watch8 : mesures | **Non vérifié** | — | — | — | Aucune donnée de montre affichée |
| Déploiement Hostinger | Documenté, **non exécuté** | `docs/DEPLOY_HOSTINGER.md` | — | — | À valider dans hPanel |
| Sauvegarde / restauration | Documenté, restauration non essayée | `docs/BACKUP_RESTORE.md` | — | — | — |

## Résultats des commandes exécutées
- `php artisan test` : **28 réussis** (180 assertions).
- `npm test` (vitest) : **7 réussis**.
- `npm run build` (tsc + vite) : réussi ; JS principal ≈ 350 ko (107 ko gzip), graphiques chargés à la demande.
- `php artisan migrate --seed` : exécuté sur la base **SQLite locale** de développement. Migrations MySQL **non exécutées** (SQLite en tests).
- Navigateur intégré : inscription, tableau de bord, bandeau de sécurité, tendances, catalogue d'aliments, service worker.
- Les données de test saisies dans le compte local `testeur@example.test` ne servent qu'au développement (SQLite locale).

## Commandes
Local : voir README. Déploiement : voir docs/DEPLOY_HOSTINGER.md.

## Restant à faire / à décider
1. Valider les règles de sécurité avec un professionnel de santé.
2. Inspecter la vraie montre avec nRF Connect et le prototype BLE ; identifier l'application compagnon.
3. Tester sur Hostinger (PHP, SSL, SMTP, racine documentaire), puis sur un téléphone (installation, hors ligne).
4. Ajouter vérification d'e-mail et 2FA si le service est ouvert au public.

---

# Module complémentaire : bilan énergétique, activités, GPS, notifications

Ajouté au projet existant (aucun module supprimé ; l'ancienne API `reminders` est conservée mais n'est plus utilisée par l'interface, remplacée par les préférences de notifications).

| Fonctionnalité | État réel | Fichiers principaux | Tests effectués | Résultat | Limites |
|---|---|---|---|---|---|
| Calcul calorique MET brut/net, Mifflin-St Jeor, bilan | Terminé et testé | `EnergyCalculator`, `EnergyService`, `Energy.tsx` | 8 unitaires + 10 feature (formules, net ≠ brut, pas de double comptage, recalcul après modif/suppression, données manquantes, isolation) + page vérifiée dans le navigateur | Réussi | Valeurs MET reprises du Compendium sans revérification ligne par ligne ; kcal/portion = ordres de grandeur |
| Catalogue d'activités + formulaire illustré, modification/suppression | Terminé et testé | `ActivityCatalogSeeder`, `ActivityForm.tsx`, `Activity.tsx` | Feature (validation, personnalisée, poids, plusieurs par jour) ; 13 pictogrammes décodés dans le navigateur | Réussi | Source « appareil connecté » désactivée (protocole non vérifié) |
| Repas : correction et estimation de calories explicite | Terminé et testé | `Food.tsx`, `FoodCatalogSeeder` | Feature + navigateur (bilan mis à jour) | Réussi | Calories jamais ajoutées automatiquement |
| Ma journée (chronologie, récapitulatif, déclaré vs détecté) | Terminé et testé | `DayService`, `Day.tsx` | Feature + navigateur | Réussi | — |
| Carte, trajets GPS, pause/reprise, historique, association | Terminé ; **GPS simulé** | `TrackService`, `GpsDistanceCalculator`, `useTrackRecorder.ts`, `MapPage.tsx`, `TracksHistory.tsx` | 9 unitaires + 12 feature ; parcours complet dans le navigateur avec un GPS **simulé par script** (consentement → démarrage → pause → reprise → fin, 2 segments, tracé sur carte OSM) | Réussi | **Non testé avec un vrai GPS** ni écran éteint/arrière-plan/batterie ; suivi en arrière-plan non garanti (PWA) |
| Vie privée GPS (consentement serveur, purge 90 j, suppression) | Terminé et testé | `TrackController`, `PruneTracks` | Feature + commande exécutée | Réussi | Cron Hostinger non vérifié |
| Centre de notifications, préférences, rappels internes | Terminé et testé | `NotificationScheduler`, `Notifications.tsx`, `NotificationSettings.tsx` | 10 feature (fuseau, fenêtre, dédoublonnage, déjà fait, interrupteur, hebdo, lecture, isolation) + navigateur (2 rappels créés, pastille) | Réussi | Préférences non cliquées une par une dans l'interface |
| Notifications push (Web Push/VAPID) | Implémenté, **non vérifié de bout en bout** | `WebPushSender`, `push.ts`, `service-worker.js` | Statut « non configuré » et validation testés | Envoi réel non testé | Aucune clé VAPID ni service push dans l'environnement ; proposé uniquement si le serveur est configuré |
| Correctif : dates en UTC | Terminé et testé | `StoresDatesInAppTimezone` | Régression + essai GPS | Réussi | Base SQLite de développement réinitialisée |

Résultats : `php artisan test` **79 réussis (481 assertions)** ; `npm test` **12 réussis** ; `npm run build` réussi.
Défauts trouvés pendant les essais et corrigés : décalage d'une heure des dates reçues avec fuseau (un trajet était clos « périmé » à tort) ; pictogrammes SVG invalides (attribut `fill` en double) ; cache du service worker qui servait d'anciennes images (désormais « stale-while-revalidate »).
Ce qui reste à vérifier par vous : vrai GPS sur téléphone, Web Push avec vos clés VAPID, cron Hostinger, valeurs MET et kcal avec une source de référence.

---

# Module : exercices physiques, montre facultative, publication

| Fonctionnalité | État réel | Fichiers principaux | Tests | Résultat | Limites |
|---|---|---|---|---|---|
| Catalogue d'exercices (musculation, abdominaux, mobilité, général), 29 fiches complètes | Terminé et testé | `ExerciseSeeder`, `ExerciseDetail.tsx`, `ExerciseList.tsx` | 3 feature (contenu complet, groupes demandés, matériel) | Réussi | Texte à faire relire par un professionnel du sport/kiné |
| Illustrations départ/arrivée, couvertures, bannière, pictogrammes d'activités | Terminé et testé | `scripts/figures.mjs`, `scripts/make-figures.mjs`, `public/images/exercises/**` | Test : toutes les images existent sur disque ; 0 image cassée sur 12 pages à 360 px | Réussi | Illustrations **stylisées originales**, pas des planches anatomiques ; aucune image iStock (licence payante) |
| Programmes (créer, modifier, dupliquer, 5 modèles) | Terminé et testé | `WorkoutProgramController`, `Programs.tsx`, `lib/exercises.ts` | 4 feature + 3 vitest (suggestion, matériel, durée) | Réussi | — |
| Séance minutée (pause, reprise, repos, précédent/suivant, arrêt) | Terminé et testé | `lib/workoutRunner.ts`, `SessionRunner.tsx` | 7 vitest (machine à états) + essai navigateur avec vrais chronos (26 s) | Réussi | Pas testé sur téléphone ; écran allumé via Wake Lock si disponible |
| Historique et progression (graphiques réels) | Terminé, vérifié | `ExerciseProgress.tsx`, `WorkoutSessionController` | Feature + navigateur (séance enregistrée, activité au bilan) | Réussi | — |
| Intégration bilan énergétique + anti double comptage | Terminé et testé | `WorkoutService`, `log-activity` | 4 feature (ajout, doublon manuel remplaçable, GPS/montre jamais remplacés, une seule fois) | Réussi | MET de catégorie indicatifs (voir ENERGY.md) |
| Sécurité médicale des exercices (open/restricted/blocked) | Terminé et testé | `WorkoutService::access`, `ExerciseBits.tsx` | 4 feature (restriction, urgence, réouverture après évaluation) | Réussi | Seuils non validés cliniquement |
| Isolation des programmes et séances | Terminé et testé | `WorkoutProgramController`, `OwnedPolicy` | 2 feature (404 inter-comptes, programme d'autrui non attachable) | Réussi | — |
| **Ma montre** : page, états, connexion/déconnexion/reconnexion, dépannage | Terminé ; **testé avec un appareil Bluetooth simulé** | `Watch.tsx`, `useWatch.ts`, `lib/watch.ts` | 10 vitest (décodeurs SIG, erreurs) + 11 feature (sans montre, doublons, sources, capacités, indépendance) + essai navigateur simulé (connexion, 6 mesures, perte, reconnexion, déconnexion volontaire) | Réussi | **Aucun test sur la vraie Watch8** ; on ignore si elle expose le profil standard de fréquence cardiaque |
| Données réellement récupérées de la montre | **Non vérifié sur matériel** | — | — | — | Seule la fréquence cardiaque standard peut être lue ; pas, sommeil, SpO₂, HRV, calories : non pris en charge |
| Fonctionnement sans montre | Terminé et testé | toutes les pages | Test feature : 18 routes principales répondent sans appareil | Réussi | — |
| Dépendances compatibles PHP 8.2 | Terminé | `composer.json` (`platform.php`), `composer.lock` | 109 tests rejoués après re-résolution ; `composer audit` / `npm audit` : 0 alerte | Réussi | Testé en PHP 8.5 local seulement |
| Publication GitHub | **Terminé** | dépôt `ShekinaBanza/Moyo`, branche `main` | `git ls-remote` : le commit distant = commit local ; page GitHub : fichiers présents, pas de `.env` | Réussi | Le dépôt est **public** |
| Déploiement Hostinger | **Non effectué** (aucun accès) | `docs/DEPLOY_HOSTINGER.md`, `deploy/hostinger/`, `deploy/moyo-hostinger-upload.zip` | Paquet de production démarré en local (99 routes, `/up` et `/` = 200) | Paquet prêt | Site actuel = page par défaut Hostinger ; étapes manuelles à exécuter |

Totaux : **109 tests backend (1 293 assertions), 32 tests frontend, build réussi**.
Défauts trouvés pendant ces essais et corrigés : relation de profil mise en cache faussant la règle de sécurité (relecture fraîche), déconnexion volontaire de la montre signalée « connexion perdue », `composer.lock` exigeant PHP 8.4.1+ (re-résolu pour PHP 8.2), couvertures de catégories trop zoomées.

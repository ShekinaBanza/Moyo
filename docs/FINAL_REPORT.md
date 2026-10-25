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

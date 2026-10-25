# Notifications et rappels

## Deux canaux
1. **Dans l'application** (toujours disponibles) : centre de notifications, pastille de non lues, préférences. Table `notifications`, préférences `notification_preferences` (rien d'activé par défaut), interrupteur général `health_profiles.notifications_enabled`, fuseau `health_profiles.timezone`.
2. **Notifications du navigateur (Web Push)** — facultatives, **seulement si** le serveur a des clés VAPID, que le navigateur les gère et que l'utilisateur a accepté. Sinon l'interface le dit (« envoi push non configuré ») et aucune notification n'est jamais marquée « envoyée ».

## Quand un rappel est créé
`NotificationScheduler` crée un rappel si : la catégorie est activée, le jour correspond à la fréquence (quotidien / jours ouvrés / hebdo + jour), l'heure locale (fuseau de l'utilisateur) est passée mais de moins de **3 h**, et l'action n'est **pas déjà faite** (repas/sommeil/activité déjà notés). Clé unique `(user_id, dedupe_key)` : **un rappel par type et par jour**, jamais de doublon. Les rappels ne contiennent aucune valeur de santé et ne sont pas des alertes médicales.
Catégories : petit-déjeuner, déjeuner, dîner, journal alimentaire, journal du sommeil, activités, bilan quotidien, tendances hebdomadaires, synchronisation d'appareil (seulement si un appareil est associé et non synchronisé depuis 24 h), trajet ouvert (silencieux depuis 10 min), saisies non synchronisées (évalué sur l'appareil : bandeau).

## Sans tâche planifiée (fonctionne tel quel)
La génération est déclenchée à l'ouverture de l'application et à chaque lecture du compteur (`GET /notifications`). Si l'application est fermée, rien n'est créé avant la prochaine ouverture : **un rappel ne peut pas apparaître à 8 h si personne n'ouvre Moyo ni ne reçoit de push**, et il expire après 3 h.

## Avec cron (recommandé sur Hostinger)
hPanel → Avancé → Tâches Cron, **chaque minute** :
```
* * * * * /usr/bin/php /home/UTILISATEUR/moyo/artisan schedule:run >> /dev/null 2>&1
```
(`which php` / version PHP à adapter ; chemin réel de l'hébergement à vérifier.) Le planificateur lance `notifications:generate` toutes les 5 min (rappels dus + push) et `tracks:prune` chaque nuit. Aucun worker de file d'attente n'est nécessaire.

## Activer Web Push
```bash
php artisan webpush:vapid        # affiche VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY
```
Copier les deux lignes dans le `.env` **du serveur** (jamais dans Git), puis `php artisan config:cache`. Ne pas changer ces clés ensuite (les abonnements existants deviendraient invalides). Extensions PHP requises par la bibliothèque `minishlink/web-push` : openssl, mbstring, curl (gmp/bcmath conseillés). Après abonnement, la page de préférences permet « Tester ».
Comportement : abonnement expiré (404/410) supprimé automatiquement ; échecs comptés ; statut par notification (`sent`, `failed`, `not_configured`, `not_requested`). La permission du navigateur n'est demandée qu'après un clic sur « Activer sur cet appareil » et une explication.

## Limites honnêtes
- Web Push dépend du navigateur (sur iPhone : application ajoutée à l'écran d'accueil, iOS récent), de l'économie de batterie et des réglages « ne pas déranger ». Non garanti.
- **Non vérifié de bout en bout** : l'envoi réel vers un navigateur n'a pas pu être testé dans l'environnement de développement (pas de clés ni de service push). Le code d'envoi, d'abonnement et de test est implémenté ; les tests automatisés vérifient le statut « non configuré », la validation, l'isolation et l'absence de doublon, pas la réception.
- Les symptômes d'alerte suivent les règles de sécurité médicale (docs/SAFETY_RULES.md) et leur bandeau, **pas** ce système : une notification n'est pas un service d'urgence.

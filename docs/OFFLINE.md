# PWA et fonctionnement hors ligne

## Service worker (`public/service-worker.js`)
- Met en cache : coquille de l'app (`/`), `offline.html`, manifeste, icônes, `/build/*`, `/images/*`, `/icons/*`.
- **Ne met jamais en cache** `/api/*`, `/sanctum/*` ni aucune requête non-GET. Les réponses API portent aussi `Cache-Control: no-store`. Vérifié dans le navigateur : aucune entrée `/api` dans le cache.
- Le HTML de la coquille est identique pour tous et ne contient aucune donnée utilisateur (le jeton CSRF vient d'un cookie, pas du HTML).
- Message `purge` à la déconnexion et à la suppression du compte vide les caches.

## Brouillons hors ligne (`resources/js/lib/offline.ts`)
- Création de repas, sommeil, symptômes, mesures, activités : si le réseau est indisponible, l'entrée est stockée dans **IndexedDB** avec un `client_id` (UUID) stable, l'heure locale de création et son état (`pending`, `failed`, `conflict`).
- L'interface dit clairement « pas encore enregistré ». Une entrée n'est retirée **qu'après la réponse du serveur**.
- Nouvelle tentative automatique au retour du réseau et à la connexion ; le serveur déduplique sur `(user_id, client_id)` : pas de doublon.
- Rejet 422 → l'entrée reste en `conflict` avec le message d'erreur ; l'utilisateur peut réessayer ou supprimer.
- Dates distinctes : heure de la mesure (`measured_at`/`eaten_at`…), création locale (outbox), réception serveur (`created_at`, `received_at` pour les mesures).

## Limites de confidentialité
IndexedDB **n'est pas chiffrée** : quiconque accède au profil du navigateur déverrouillé peut lire les brouillons non envoyés. Les brouillons sont purgés à la déconnexion et à la suppression du compte, mais pas si le navigateur est simplement fermé. Sur appareil partagé, déconnectez-vous.
Les modifications et suppressions ne sont **pas** disponibles hors ligne (création seulement).

## Tests
Exécutés et réussis : `npm test` (4 tests de la file d'attente) et, dans le navigateur intégré, avec les requêtes `/api` rendues indisponibles par script : saisie d'un repas → brouillon IndexedDB `pending` + bandeau « hors ligne » + rien sur le serveur ; retour du réseau → envoi, brouillon supprimé, 1 seule entrée serveur ; brouillon créé puis page rechargée → envoyé à la réouverture, aucun doublon ; déconnexion → brouillons purgés.
Limite : le réseau a été simulé par script (pas de coupure Wi-Fi réelle ni d'installation sur téléphone).
Constat corrigé : une déconnexion hors ligne ne peut pas fermer la session serveur ; l'application purge les données locales et prévient l'utilisateur.

# Carte, trajets GPS et distance

Code : `app/Services/GpsDistanceCalculator.php`, `TrackService.php`, `Api/TrackController.php`, `resources/js/hooks/useTrackRecorder.ts`, `components/MapView.tsx` (Leaflet), pages Carte et Historique.

## Calcul de la distance
Somme des distances **haversine** entre points successifs (jamais premier→dernier). Filtres appliqués par le **serveur** (le navigateur n'affiche qu'une estimation en direct avec les mêmes règles) :
- point de précision rapportée > 50 m → écarté ;
- point à moins de 3 m du dernier point retenu → ignoré (bruit GPS à l'arrêt) ;
- vitesse implicite > 15 m/s (54 km/h) → écarté (saut aberrant) ;
- rien n'est compté **entre deux segments** (pause/reprise) ni sur une **perte de signal** de plus de 300 s (`gap_count`) ;
- allure moyenne affichée seulement si distance ≥ 100 m et durée ≥ 60 s.
La durée est le temps couvert par les points retenus (pauses exclues). Les points sont dédupliqués sur `(track_id, captured_at)` : renvoyer un lot ne change rien.

## Source des distances
`manual` (saisie), `gps` (trajet associé), `watch` (jamais proposé tant que le protocole n'est pas vérifié). Quand un trajet est associé à une activité, la distance GPS **remplace** toute autre : GPS + montre/saisie sur le même trajet sont refusés (422) pour ne pas compter deux fois. Un trajet n'est pas une marche : la chronologie le marque « détecté par GPS » et « non associé » tant que l'utilisateur ne l'a pas relié à une activité.

## États
`recording` → `paused` ↔ `recording` → `finished`, ou `interrupted` (autorisation retirée, signal perdu, **trajet laissé ouvert** : clôturé à la lecture suivante s'il n'a plus de point depuis 30 min en cours / 12 h en pause, `end_reason = stale`).

## Vie privée
- **Consentement explicite** `gps_tracking` exigé : fenêtre dans l'interface **et** contrôle serveur (403 `gps_consent_required`). Retirable depuis la page Carte.
- La position n'est demandée qu'au clic « Commencer un trajet » et lue seulement pendant le trajet (arrêt à la pause/fin).
- Coordonnées arrondies à 5 décimales (≈ 1 m), liées au compte, jamais dans une URL, un log ou le journal d'audit ; export JSON inclus.
- Conservation : points bruts supprimés après **90 jours** (`php artisan tracks:prune`, planifié ; le résumé distance/durée reste). Suppression d'un trajet (points en cascade) ou de tout l'historique (`DELETE /api/v1/tracks`).
- Jamais partagé automatiquement.

## Limites d'une PWA (documentées, non contournées)
Un navigateur peut suspendre la page quand l'écran s'éteint ou l'application passe en arrière-plan. Moyo demande un « verrou d'écran » (Wake Lock) quand c'est possible, affiche des avertissements (arrière-plan > 30 s, signal perdu > 60 s, précision > 50 m, batterie < 15 %) et **n'invente pas** la distance manquante. Le suivi continu fiable écran éteint nécessite une application native/Capacitor (service de localisation de premier plan) : l'architecture le permet (le serveur reçoit des lots de points via `POST /tracks/{id}/points`, quelle que soit la source), mais ce n'est pas développé.
Hors ligne : démarrer un trajet exige une connexion (le serveur crée le trajet) ; pendant le trajet, les lots de points non envoyés sont gardés dans l'outbox IndexedDB et renvoyés au retour du réseau. Si la page est fermée avant l'envoi d'un lot (≤ 10 s de positions), ces positions sont perdues. Fond de carte : nécessite Internet.

## Fond de carte
OpenStreetMap par défaut (attribution affichée). Sa politique d'usage n'autorise qu'un trafic **léger** ; pour une utilisation régulière, choisissez un fournisseur dont les conditions conviennent et définissez au build `VITE_TILE_URL` (et `VITE_TILE_ATTRIBUTION`). Une clé de tuiles côté navigateur est publique par nature : restreignez-la par domaine chez le fournisseur ; aucune clé **secrète** ne doit être dans le frontend.

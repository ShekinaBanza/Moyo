# Montre Remax Watch8 — intégration facultative

## État honnête
| Élément | État |
|---|---|
| Page « Ma montre » (`/app/watch`), états, connexion, déconnexion, reconnexion, dépannage | **Implémentés et vérifiés dans le navigateur** avec un appareil Bluetooth **simulé** (aucune montre réelle disponible) |
| Connexion à la **vraie** Remax Watch8 | **Non testée** : à valider sur le matériel |
| Décodage de profils **standard** Bluetooth SIG (fréquence cardiaque `0x180D/0x2A37`, batterie `0x180F/0x2A19`, infos appareil `0x180A`) | Implémenté et testé unitairement ; **on ignore si la Watch8 expose ces services** |
| Services propriétaires de la Watch8 (`0000d0ff-…`, `00006287-…`, `6e40ab01-…`, `0x3802`) | **Listés uniquement**, non décodés (format non documenté) |
| Pas, sommeil, SpO₂, HRV, calories, distance de la montre | **Non pris en charge**, jamais affichés ni estimés |

Recherche documentaire : aucune documentation publique du protocole Watch8 n'a été trouvée (voir `docs` précédents et [scom.hu](https://www.scom.hu/Smartwatch-Remax-Watch8-Black), [cse.jo](https://cse.jo/remax-watch-8-ultra-smart-sport-watch) : fiches commerciales seulement). L'application compagnon de votre variante reste à identifier.

## Ce que fait l'application
1. Le bouton **« Connecter ma montre »** ouvre le sélecteur Bluetooth du navigateur (autorisation demandée à ce moment, HTTPS requis ; Chrome/Edge). Filtre par défaut : noms commençant par « Watch » ; **« Afficher tous les appareils »** pour les autres.
2. Découverte des services en lecture seule : batterie et informations de l'appareil sont lues, rien n'est écrit (hors activation standard des notifications par le navigateur).
3. **États** : aucune montre associée / recherche / autorisation requise / détectée / connexion / connectée / lecture / synchronisation / synchronisation réussie / connexion perdue / appareil incompatible / navigateur non compatible / erreur de communication / **données reçues mais pas encore interprétées**. « Connectée » n'est affiché que pendant une vraie connexion GATT ; l'état serveur d'un appareil associé reste « associé, non connecté ».
4. **Mesurer ma fréquence cardiaque (30 s)** : abonnement aux notifications du profil standard ; seules les valeurs plausibles (20–250 bpm, capteur au contact) sont retenues ; envoi par `POST /measurements/sync` avec `source_type=watch`, `decoder_version=gatt-hrs-1`, date de **mesure** (arrivée de la notification : le profil ne fournit pas d'horodatage) distincte de la date de **réception**, qualité `unverified` (jamais « vérifiée » automatiquement), identifiant déterministe par seconde : renvoyer ne crée pas de doublon. Une capacité n'est marquée « confirmée » qu'après une vraie valeur décodée.
5. Perte de connexion : détectée (`gattserverdisconnected`), statut serveur mis à jour, message et bouton « Reconnecter ». Déconnexion volontaire distinguée d'une perte.
6. Aucune connexion permanente en arrière-plan : la connexion vit tant que la page est ouverte (limite d'une PWA).

## Indépendance et doubles comptes
- Aucune page ne dépend de la montre ; tests : toutes les routes principales répondent sans appareil.
- Les mesures de la montre **n'entrent pas** dans le bilan énergétique ni dans les règles de sécurité (tests dédiés). Les calories d'une montre ne sont pas utilisées (définition inconnue).
- Plusieurs sources (manuelle, montre, importée) restent séparées et étiquetées ; la distance GPS d'une activité n'est jamais cumulée avec une autre source.

## À faire sur le matériel réel (checklist)
1. Chrome Android ou ordinateur, HTTPS : « Connecter ma montre », vérifier que la Watch8 apparaît (sinon « tous les appareils »).
2. Utiliser « Inspection avancée » pour noter services et propriétés (read/notify/write) ; compléter ce fichier.
3. Vérifier si le service `0x180D` existe : si oui, tester « Mesurer ma fréquence cardiaque » en comparant avec une mesure fiable.
4. Si seuls des services propriétaires existent : identifier l'application officielle, capturer une session (journal HCI Android) et documenter les trames **avant** d'écrire un décodeur. Ne jamais envoyer d'écriture inconnue.
5. Si Web Bluetooth est insuffisant (iPhone, arrière-plan) : module Capacitor/Android natif ; le serveur est prêt (`/measurements/sync`, capacités, historique des synchronisations).

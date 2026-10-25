# Bilan énergétique, activités et estimations

Code : `app/Services/EnergyCalculator.php` (formules pures, testées), `app/Services/EnergyService.php` (agrégation depuis la base), `GET /api/v1/energy/daily|history`, page « Mon bilan énergétique ».
Rien n'est stocké : chaque chiffre est **recalculé** à chaque lecture. Modifier ou supprimer un repas ou une activité met donc le bilan à jour sans action manuelle.

## Les trois notions
| Notion | Définition |
|---|---|
| Calories consommées | Somme des `kcal` des repas du jour dont la valeur est **estimée** ou **vérifiée**. Un repas « inconnu » n'est jamais compté comme 0 : il est listé comme manquant. |
| Calories dépensées | Métabolisme de repos (24 h) **+** dépense **nette** des activités. |
| Bilan énergétique estimé | Consommées − dépensées totales. Positif : apport estimé supérieur à la dépense estimée ; négatif : l'inverse ; |écart| ≤ 100 kcal : « proches » (seuil inférieur à la marge d'erreur du modèle). |

Le bilan n'est jamais présenté comme une preuve de gain ou de perte de graisse (eau, contenu digestif, etc.).

## Formules
- **Brute** (MET) : `kcal = MET × 3,5 × poids(kg) ÷ 200 × minutes` — inclut le coût de repos pendant l'activité.
- **Nette** : `kcal = (MET − 1) × 3,5 × poids ÷ 200 × minutes` — retire 1 MET (repos) pour la même durée.
- **Repos** : Mifflin-St Jeor — homme `10 P + 6,25 T − 5 A + 5`, femme `… − 161` (P kg, T cm, A années).

## Stratégie contre le double comptage
`dépense totale = repos (24 h) + Σ nettes`. La dépense **brute** est affichée « à titre d'information, non ajoutée » et n'entre **jamais** dans le total ; brut et net ne sont pas mélangés. Le « niveau d'activité général » du profil est informatif et n'est **pas** utilisé (un facteur d'activité ajouterait l'activité une seconde fois). Test : `test_total_is_resting_plus_net_activity_never_gross`.

## Données manquantes (aucun zéro inventé)
- Repos non calculable sans : sexe (homme/femme — la formule est binaire ; « autre » → non calculé), date de naissance (15–100 ans), taille, une pesée. La page liste ce qui manque.
- Activité non estimable sans durée ou poids ; une activité personnalisée exige un effort perçu (1–3 légère = MET 2,5 ; 4–6 modérée = 4,0 ; 7–10 intense = 7,0, valeurs génériques → qualité « grossière »). Une activité du catalogue utilise son MET propre ; l'intensité ressentie n'est pas utilisée pour la corriger.
- Poids utilisé : celui saisi sur l'activité, sinon la dernière pesée **antérieure** à l'activité. Sans poids : non estimable.
- Pas de repas avec calories → pas de bilan (raison affichée). Bilan « partiel » si des repas/activités sont exclus ou si la journée n'est pas terminée.
- **Montre** : ses calories ne sont pas utilisées (aucune mesure de montre n'est décodée et la définition « actives/totales » n'est pas confirmée). La page l'indique.

## Limites à connaître
- Les **valeurs MET** du catalogue (`ActivityCatalogSeeder`) sont des ordres de grandeur du *Compendium of Physical Activities* (Ainsworth 2011), reprises et arrondies **sans revérification code par code** (la source n'a pas pu être consultée en détail pendant le développement). À vérifier avant tout usage sérieux : https://pacompendium.com.
- Les kcal « indicatives » par portion du catalogue alimentaire (`FoodCatalogSeeder::KCAL`) sont des **ordres de grandeur non vérifiés** ; elles ne sont jamais enregistrées automatiquement : l'utilisateur doit cliquer « Utiliser cette estimation » (statut « estimée »).
- Mifflin-St Jeor : précision individuelle limitée (souvent ± 10 % ou plus) ; non validée pour les enfants, grossesse, certaines maladies.
- Les mouvements non saisis ne sont pas comptés : la dépense est plutôt sous-estimée.
- Jour = jour civil dans le fuseau de l'utilisateur (`health_profiles.timezone`, défaut Africa/Kinshasa).

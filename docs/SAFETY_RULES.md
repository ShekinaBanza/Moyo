# Règles de sécurité médicale — `safety-rules-v1`

Implémentées dans `app/Services/SafetyService.php` (backend, source de vérité), testées dans `tests/Feature/FeaturesTest.php`. L'interface affiche le résultat tel quel ; elle ne le recalcule pas.

| Règle | Condition | Niveau / message |
|---|---|---|
| R1 | Douleur thoracique ou évanouissement dans les dernières 24 h, **ou** essoufflement au repos d'intensité ≥ 7 dans les dernières 24 h | `emergency` — aide médicale urgente |
| R2 | Essoufflement **et** gonflement notés dans les 14 derniers jours | `prompt_evaluation` — réévaluation médicale rapide |
| R3 | Essoufflement **ou** gonflement dans les 14 derniers jours | `caution` — à surveiller |
| R4 | Niveau ≠ `none`, **ou** symptôme d'alerte dans les 30 jours sans évaluation professionnelle déclarée | `activity_progression_allowed = false` : aucune hausse d'intensité proposée |

Principes : aucun diagnostic ; les données de montre ne sont **pas** une entrée (elles ne peuvent ni annuler ni minimiser un symptôme déclaré — test `test_watch_data_cannot_cancel_declared_symptoms`) ; aucun score composite ; pas de message « tout va bien » ; aucune illustration rassurante dans le bandeau de sécurité ; l'alerte est renvoyée immédiatement à chaque enregistrement de symptôme et affichée sur le tableau de bord, la page Symptômes et la page Activité. Le formulaire de symptôme affiche aussi un avertissement **avant** l'envoi pour les cas R1, et hors ligne le brouillon rappelle de ne pas attendre.

Limites : seuils et fenêtres (24 h/14 j/30 j) sont des choix prudents **non validés cliniquement** ; à faire relire par un professionnel de santé avant usage large. Une règle ne remplace jamais une consultation. Aucun entraînement adaptatif n'est implémenté.

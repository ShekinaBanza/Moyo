# Rapport de sécurité

## Mesures en place (vérifiées par tests sauf mention)
- **Isolation multi-comptes** : `user_id` jamais mass-assignable ; propriétaire = utilisateur authentifié ; toutes les requêtes filtrées par `user_id` (ressource d'autrui → 404) + `OwnedPolicy` ; `user_id` dans le corps ignoré. Tests (`tests/Feature/IsolationTest.php`) : A ne peut ni lister, lire, modifier ni supprimer sommeil, repas, symptômes, mesures corporelles, activités, habitudes d'un autre ; ne voit pas ni n'utilise ses appareils ; ne peut pas synchroniser au nom de B ; tableau de bord et export ne contiennent que ses données ; routes privées refusent les invités.
- **Authentification** : session cookie + CSRF (Sanctum SPA), mot de passe ≥ 10 caractères avec lettres et chiffres, hash bcrypt, régénération de session, limiteur par e-mail+IP (5 essais / 5 min, testé) + `throttle` de routes, réponse identique pour e-mail inconnu/mot de passe faux, réinitialisation sans énumération de comptes.
- **Validation serveur** de toutes les entrées (bornes, énumérations, plausibilité des mesures).
- **Suppression de compte** : mot de passe + phrase de confirmation ; cascade sur toutes les données ; journal d'audit anonymisé. **Export** JSON.
- **Consentements** enregistrés (version de politique) ; consentement santé exigé à l'inscription.
- **En-têtes** : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS en HTTPS, `no-store` sur l'API.
- **Journal d'audit** sans valeur de santé ; IP hachée (HMAC).
- **Erreurs** JSON sans trace en production (`APP_DEBUG=false`, testé en mode non-debug).
- **Pas de secret dans le code** ; `.env.example` sans secret ; aucun jeton dans le stockage du navigateur.
- **Service worker** : aucune réponse authentifiée en cache (vérifié dans le navigateur).

- **GPS** : consentement explicite vérifié côté serveur, collecte uniquement pendant un trajet démarré par l'utilisateur, coordonnées jamais dans les URL/logs/audit, points bruts supprimés après 90 jours, suppression d'un trajet ou de tout l'historique, isolation testée (trajets, points, notifications, abonnements push, énergie).
- **Notifications push** : abonnements liés au compte (un autre compte ne peut pas les supprimer), clés d'abonnement masquées dans les réponses API, payload sans donnée de santé.
- **Dates** : stockage en UTC avec conversion des dates entrantes (test de non-régression d'un décalage d'une heure découvert pendant les essais GPS).

## Limites / risques restants
- **Pas de chiffrement de bout en bout** ni chiffrement applicatif des colonnes : les données sont en clair en base (protégées par l'accès MySQL et HTTPS). L'administrateur/hébergeur y a techniquement accès. L'UI le dit.
- Brouillons hors ligne en IndexedDB non chiffrée (voir OFFLINE.md).
- Pas de vérification d'e-mail à l'inscription ; pas d'authentification à deux facteurs ; pas de CSP stricte ; pas de détection de mots de passe compromis.
- Réinitialisation de mot de passe : **non testée avec un vrai SMTP**.
- Aucun audit de pénétration ni scan de dépendances automatisé en continu (`npm audit` : 0 vulnérabilité au moment de l'installation ; `composer audit` sans alerte à l'installation).
- Limiteur de débit basé sur le cache par défaut (base de données) : suffisant pour un hébergement mutualisé, à surveiller.
- Le HTTPS et les permissions de fichiers dépendent de la configuration Hostinger, non vérifiée ici.

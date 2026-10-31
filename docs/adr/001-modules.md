# ADR 001 — Module unique et mémoire bornée

Décision : un monolithe modulaire avec routes séparées des règles, contrats immuables et stockage mémoire limité à 1000 tâches. Contexte : démonstration locale des frontières HTTP/métier sans compte cloud ni dépendance tierce. Coût : aucun service facturé créé.

Alternatives : PostgreSQL pour durabilité et transactions ; SQLite pour fichier local ; microservices pour autonomie d'équipes et de déploiements. Ces options ajouteraient exploitation ou dépendances inutiles au premier contrat. Blob ne remplace pas la DB relationnelle. Le verrou sur l'admission protège la limite sous concurrence.

Compromis : perte totale au redémarrage, absence d'idempotence/authentification et incohérence entre réplicas. Réviser dès qu'une persistance, des utilisateurs multiples, une saturation mesurée ou une évolution indépendante est nécessaire. Une migration de données et un exercice de restauration seront alors requis. Kubernetes n'est pas implémenté.

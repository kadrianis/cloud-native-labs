# Preuves locales — 31/10/2026

- SDK .NET 10.0.402 ; runtime ASP.NET 10.0.13.
- `dotnet run --project labs/modular-jobs/Checks -c Release --no-restore` : SUCCESS: 16 checks, code de sortie 0.
- HTTP réel sur Kestrel loopback ; première tentative bloquée par le bac à sable (10013), réexécution autorisée réussie.
- Bicep CLI 0.48.1 installé dans une configuration isolée ignorée par Git ; `az bicep build --file infra/storage.bicep --outfile .azure-local/storage.json` : code de sortie 0, aucun diagnostic.
- Aucune connexion d'abonnement, prévisualisation distante, application ou suppression exécutée.
- La CI doit être vérifiée sur le SHA publié ; le manifeste privé conserve son lien exact. Aucun succès CI n'est inféré de ces seules preuves locales.

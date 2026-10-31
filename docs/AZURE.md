# Stockage sécurisé — exercice Azure manuel

État : modèle Bicep uniquement, sans déploiement ni connexion à l'API. Utiliser l'abonnement personnel déjà existant, jamais un contexte professionnel. Aucun identifiant personnel dans le code. Bicep est choisi pour ARM sans fichier state Terraform ; Terraform devient une alternative pour équipe multi-cloud avec gestion explicite du state.

## Compiler et prévisualiser

```powershell
az bicep version
az bicep build --file infra/storage.bicep --outfile storage.json
```

Les étapes suivantes sont **manuelles**, après vérification du contexte et autorisation de création. What-if nécessite un groupe existant et des permissions de déploiement : la création préalable du groupe n'est pas une prévisualisation.

```powershell
$personalSubscription = Read-Host 'ID abonnement personnel vérifié'
az account set --subscription $personalSubscription
az account show --query '{name:name,id:id,tenantId:tenantId}' -o json
# Relire le portail et arrêter si le contexte n'est pas personnel.
$labGroup = 'rg-modular-jobs-sandbox'
az group create --name $labGroup --location francecentral
az deployment group what-if --resource-group $labGroup --template-file infra/storage.bicep
```

Attendu : un compte StorageV2 Standard_LRS, pas de rôle, de secret, d'application ou d'endpoint privé. Arrêter si suppressions ou ressources inattendues. Lire les diagnostics : what-if peut être incomplet, la compilation n'est pas une autorisation Azure ni une validation régionale.

## Appliquer et contrôler manuellement

Après lecture du what-if, chiffrage et autorisation spécifique :

```powershell
az deployment group create --name storage-lab --resource-group $labGroup --template-file infra/storage.bicep
$storageId = az deployment group show --name storage-lab --resource-group $labGroup --query properties.outputs.storageId.value -o tsv
az storage account show --ids $storageId --query '{https:enableHttpsTrafficOnly,tls:minimumTlsVersion,publicBlobs:allowBlobPublicAccess,sharedKeys:allowSharedKeyAccess,network:publicNetworkAccess,defaultAction:networkRuleSet.defaultAction}' -o json
```

Attendu : true, TLS1_2, false, false, Disabled, Deny. Si null, inspecter la réponse complète et ses noms de propriétés. Vérifier Succeeded dans le portail. Aucun résultat Azure n'a été observé pendant cette livraison. Le réseau de données est fermé : lecture/écriture blob depuis le poste n'est pas prévue. Endpoint privé, DNS et rôle Blob Data approprié seraient nécessaires pour un exercice de données ultérieur et peuvent créer des frais.

## Coûts datés du 31/10/2026

Aucune ressource déployée par cette exécution. La page officielle confirme une facturation selon volume, opérations, transferts et redondance. Les tarifs région/devise/contrat sont dynamiques ; aucun prix France Central EUR exploitable n'a été extrait. Aucun total commercial n'est inventé. Avant application, relever les tarifs personnels : `GiB moyens × prix/GiB-mois + écritures/10000 × prix lot + lectures/10000 × prix lot + transfert sortant`. Ajouter endpoints, logs et taxes si activés. Un stockage vide n'est pas une garantie de facture nulle. Si le chiffrage reste inconnu, ne pas appliquer. Un budget alerte mais ne coupe pas les ressources.

- https://azure.microsoft.com/en-us/pricing/details/storage/blobs/
- https://learn.microsoft.com/en-us/azure/storage/common/storage-plan-manage-costs

## Nettoyage et retour arrière manuels

```powershell
az resource list --resource-group $labGroup --query '[].{name:name,type:type}' -o table
# Uniquement après contrôle humain du groupe jetable et autorisation de suppression :
az group delete --name $labGroup
az group exists --name $labGroup
```

Attendu final : false. Ne pas supprimer un groupe partagé. Ces commandes n'ont pas été exécutées. Le nettoyage détruit les données éventuelles ; aucune restauration n'est configurée. Pour annuler une configuration, revenir au Bicep précédent, relire what-if et appliquer manuellement après autorisation ; cela ne restaure aucun blob.

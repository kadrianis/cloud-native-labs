# LABS_ — Lectures SaaS résilientes

Un client GET réutilisable, sans dépendance npm, pour consulter un statut de tâche malgré une indisponibilité temporaire. Il complète l'API .NET existante sans ajouter de produit hébergé. La démonstration embarque un serveur synthétique indépendant ; elle ne prétend pas tester l'intégration .NET.

## Installer et lancer

Node.js 22, modules natifs uniquement ; aucun `npm install` requis. Depuis la racine :

```sh
node --version
node --test labs/resilient-reader/reader.test.mjs
node labs/resilient-reader/demo.mjs
```

Résultat de la démo : `{ status: 200, body: '{"status":"ok","jobs":[]}', attempts: 2 }`. Le serveur local renvoie d'abord 503 puis 200, utilise un port éphémère et ferme ses connexions à la fin. Aucun appel externe.

Pour consulter manuellement l'API existante, la lancer selon le README racine, puis depuis la racine :

```sh
node --input-type=module -e "import {read} from './labs/resilient-reader/reader.mjs'; console.log(await read('http://127.0.0.1:5080/health'));"
```

## Cours : une reprise est une décision métier

Un délai réseau ne prouve pas qu'une requête n'a pas été traitée. Répéter aveuglément un POST peut créer deux tâches, deux factures ou deux paiements. Ce composant expose seulement `read(url, options)` et émet uniquement GET. Il suppose que le serveur respecte la sémantique d'une lecture sans effet métier. Une clé d'idempotence envoyée à un serveur qui ne la gère pas ne constitue aucune garantie.

Une boucle de reprises doit borner trois dimensions : nombre de requêtes, durée totale et taille des données. Le budget temporel est créé avant la boucle, puis partagé entre connexion, réception des en-têtes, lecture du corps et attente. Un timeout par tentative seulement permettrait de multiplier la durée totale. La limite du corps porte sur les octets reçus après décompression par fetch ; le client n'attend pas la fin d'une réponse démesurée.

Pour une panne transitoire, le délai exponentiel avec jitter distribue les nouvelles tentatives dans le temps. Ici le délai aléatoire est compris entre zéro et `min(maxDelayMs, baseDelayMs × 2^(tentative−1))`. Ce mécanisme réduit la synchronisation ; il ne remplace ni limitation de débit ni circuit breaker partagé.

`Retry-After` demande un minimum d'attente : secondes entières ou date HTTP IMF-fixdate. Le réduire au plafond local provoquerait une reprise trop tôt. Si ce minimum dépasse `maxDelayMs`, le client rend donc la réponse courante au demandeur, qui décide d'une reprise ultérieure. Si le minimum rentre dans le plafond mais dépasse le temps restant, l'annulation globale interrompt l'attente sans nouvel appel.

## Contrat

```js
import { read } from './reader.mjs';
const result = await read('http://127.0.0.1:5080/health', {
  attempts: 3, timeoutMs: 5000, baseDelayMs: 100,
  maxDelayMs: 2000, maxBytes: 65536,
});
if (result.status === 200) console.log(JSON.parse(result.body));
```

Retour : `{status, body, attempts}`. Le corps est du texte UTF-8 ; le demandeur traite les statuts et parse le JSON. Une réponse HTTP finale, y compris 503, est rendue sans exception. Les erreurs réseau finales, limites et annulations rejettent la promesse. Une erreur de lecture du corps n'est pas reprise automatiquement.

| Situation | Décision |
|---|---|
| 429, 502, 503, 504 | Reprise si budget et nombre le permettent |
| Échec fetch avant réponse | Reprise GET bornée ; aucune classification DNS/TLS fine |
| 400, 401, 404, 409, 500 ou autre statut | Réponse terminale |
| 3xx | Réponse terminale, redirections manuelles, aucun suivi |
| Retry-After absent ou mal formé | Backoff exponentiel avec jitter |
| Retry-After trop long | Réponse immédiate, aucune reprise anticipée |
| Corps trop grand ou interrompu | Exception, aucune reprise du corps |
| Délai global ou annulation appelant | Exception, plus de requête |

Valeurs autorisées : `attempts` 1–5 ; `timeoutMs` 1–30000 ; `baseDelayMs` 0–5000 ; `maxDelayMs` 0–10000 ; `maxBytes` 1–1048576. Entiers uniquement. Une URL HTTP(S) sans identifiants est nécessaire. Les délais JavaScript dépendent de l'event loop : pas une garantie temps réel.

## Exercice et correction complète

1. Simuler un 503 suivi d'un 200 et vérifier deux appels, pas trois.
2. Simuler un 429 avec `Retry-After: 60` et un plafond de deux secondes. Faut-il attendre deux secondes puis recommencer ?
3. Faire envoyer les en-têtes 200 puis un corps qui ne se termine pas. Le délai global doit encore agir.
4. Renvoyer dix caractères « é » avec une limite de dix octets.
5. Expliquer pourquoi la création de tâches ne doit pas utiliser ce lecteur.

Correction : les fixtures et assertions exécutables sont dans [reader.test.mjs](reader.test.mjs). Les cas 1 et 2 vérifient respectivement `attempts === 2` et `calls() === 1`. Le cas 2 rend immédiatement 429 : attendre moins de 60 secondes serait une violation du minimum annoncé. Le cas 3 attend le rejet et vérifie un appel seulement. Le cas 4 rejette : dix « é » occupent vingt octets UTF-8. Le cas 5 nécessite une API d'écriture séparée avec déduplication transactionnelle côté serveur avant toute reprise ; un client seul ne peut pas offrir « exactement une fois ».

Lire [reader.mjs](reader.mjs) pour la solution complète : validation avant réseau, signal global, boucle bornée, libération du corps abandonné avant attente, puis lecture bornée du résultat final. [demo.mjs](demo.mjs) constitue une correction exécutable minimale du scénario 503 → 200.

## Architecture et alternatives

Bibliothèque ESM séparée de la démo et des tests. `fetch` assure HTTP, `AbortSignal` partage l'annulation, `node:timers/promises` assure une attente annulable. Le domaine SaaS et les identités restent hors de ce composant. L'API .NET conserve son comportement existant.

Alternatives : aucun retry si l'action n'est pas sûre ; bibliothèque cliente maintenue si authentification, proxy, métriques et davantage de politiques sont requis ; ordonnanceur durable pour attendre plusieurs minutes ou survivre au redémarrage ; circuit breaker pour éviter que de nombreux clients amplifient une panne. Une nouvelle dépendance doit être évaluée à la version choisie avant adoption.

## Validation et limites

Exécuté le 1 novembre 2026 sous Windows, Node v22.22.2 : **21 tests, 21 réussites**, avec HTTP réel sur loopback et attente d'une seconde réellement mesurée. Cas couverts : les quatre statuts transitoires, statuts terminaux, socket coupée, plafond d'essais, dates, limite UTF-8, corps bloqué et annulation pendant attente. Le premier essai en environnement restreint a échoué sur EACCES loopback ; la suite autorisée a ensuite réussi. La démo doit être lancée avec les mêmes droits de connexion locale. La CI exécute cette suite sous Node 22 sur Linux et garde les contrôles .NET/Bicep existants.

Pas d'authentification, d'en-têtes personnalisés, de POST, de télémétrie, de cache, de circuit breaker, de persistance ou de déploiement. Ne pas connecter une URL fournie par un tiers sans validation d'origine : ce client n'est pas une protection SSRF. Les dates HTTP anciennes sont volontairement ignorées ; l'horloge locale peut être fausse. Les erreurs fetch permanentes peuvent consommer le budget de reprises. Aucune charge de production ni intégration navigateur n'est revendiquée.

Prochain incrément : intégrer explicitement le lecteur au suivi de tâche SaaS avec une origine configurée et une identité validée, puis tester le parcours de bout en bout. Ne pas ajouter de reprise POST avant un contrat d'idempotence serveur vérifié.

## Sources vérifiées le 1 novembre 2026

- [RFC 9110, §9.2.1–9.2.2 et §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html) : sûreté, idempotence et Retry-After.
- [Documentation Node v22.22.2, objets globaux](https://github.com/nodejs/node/blob/v22.22.2/doc/api/globals.md) : fetch et annulation.
- [Sources du runner de tests Node](https://nodejs.org/api/test.html) : runner natif ; la documentation courante peut viser une majeure différente du runtime testé.

La version locale est une preuve d'exécution, pas une affirmation d'être le dernier correctif Node disponible. La politique de statuts repris est propre au projet, pas imposée par la RFC.

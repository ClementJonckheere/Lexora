# Placement grammatical : moteur expérimental et validation

Le moteur est implémenté dans `src/core/learn/placement.ts`. Il n'est pas activé dans l'interface et ne modifie ni les données utilisateur, ni le schéma SQLite / Supabase, ni FSRS. La banque d'exercices dédiée A1–C1, l'enregistrement des résultats, leur correction manuelle et les mini-tests de leçon restent à construire.

## Modèle et règles

- Chaque point commence à une probabilité de maîtrise de 0,5. Le niveau et `after` ne servent pas à déduire des acquis.
- Les réponses directes mettent cette probabilité à jour par Bayes. Hypothèses initiales : 10 % d'inattention pour un point connu ; 5 % de chance pour une réponse tapée ; `1 / nombre de propositions` pour un choix. Ces taux restent des hypothèses à calibrer sur des réponses réelles.
- `Je ne sais pas` est conservé comme réponse distincte et traité comme une réponse non réussie dans le calcul. Aucune répétition d'une même phrase n'est comptée deux fois.
- Un résultat direct demande au moins deux questions et 85 % de confiance : `mastered` (acquis) si p ≥ 0,85, `learn` (à apprendre) si p ≤ 0,15. Les autres résultats sont `consolidate` (à consolider), avec une raison explicite : non évalué, questions incomplètes, incertitude ou contradiction. « À consolider » ne prouve donc pas une maîtrise partielle.
- La propagation exige **99 %** de confiance. Un acquis renseigne uniquement ses prérequis stricts ; une non-maîtrise renseigne uniquement ses dépendants. Les pièges n'ont aucun lien de propagation et peuvent être testés dans une session distincte.
- La déduction conserve la preuve la plus forte et ses sources. Elle ne multiplie pas les probabilités de plusieurs descendants corrélés. Les probabilités directes sont des postérieurs bayésiens ; les valeurs déduites sont des bornes issues de l'hypothèse de prérequis stricts, pas les postérieurs d'un réseau bayésien joint.
- Si des résultats directs suffisamment confiants contredisent un prérequis, les deux sources cessent de se propager. Le moteur propose de nouvelles questions ; une contradiction non résolue reste visible.

Pour une réussite et un état connu K :

Avec p la probabilité initiale, s le taux d'inattention et g le taux de chance :

$$
P(K \mid R) = \frac{p(1-s)}{p(1-s)+(1-p)g}
$$

Le calcul rejoue les log-vraisemblances de l'historique, ce qui permet de revenir sur une estimation même après de nombreuses réponses dans le même sens. Il ne repose pas sur une probabilité arrondie devenue égale à 0 ou à 1.

## Choix des questions et arrêt

Le moteur choisit une question selon le nombre attendu de points qui pourraient devenir classables, rapporté au nombre de questions nécessaires. Il examine un petit horizon, jusqu'à quatre réponses (ou le minimum demandé s'il est supérieur), en tenant compte de `requires`, du hasard des choix et du coût des confirmations. Il termine d'abord le minimum de questions d'un point commencé.

Il peut recontrôler un résultat direct déjà conclu pour atteindre les 99 % nécessaires à sa propagation. Il n'entame pas un nouveau point s'il ne reste pas assez de questions ou de phrases distinctes pour respecter le minimum.

Trois motifs de fin : tous les points sont conclus, plafond atteint, banque insuffisante. Le budget est plafonné à 40. Il arrive d'arrêter à 39 lorsqu'une dernière question ne permettrait pas d'en commencer deux sur un nouveau point. Les points non évalués restent incertains.

L'API utilise un catalogue de cibles (`point` ou `trap`), des métadonnées de questions et un historique rejouable de réponses. Elle ne fabrique aucun texte d'exercice. `after` est accepté comme métadonnée mais ignoré par le calcul et le choix des questions.

## Simulation permanente

Reproduire le rapport :

```sh
npm run simulate:placement
npm test
```

Le premier lance `scripts/simulate-placement.ts` et écrit [`placement-simulation.json`](placement-simulation.json). Le second inclut automatiquement les tests du moteur et de la simulation dans la CI existante.

Le rapport contient la graine, les paramètres, les empreintes SHA-256 du parcours et des deux modules, et les métriques de chaque profil. Il utilise les **74 vrais points** du parcours, avec **12 questions abstraites par point** : ce sont des identifiants de simulation, sans phrases anglaises, qui ne sont jamais montrés à l'utilisateur.

Huit profils : débutant, acquis jusqu'à chacun des niveaux A1 / A2 / B1 / B2 / C1, avancé avec lacunes hors `after`, et profils dispersés. La vérité respecte `requires`, mais pas nécessairement `after` : par exemple, le profil irrégulier connaît le subjonctif sans connaître les questions rapportées, et `be used to` sans `used to`. Aucun apprentissage n'est simulé pendant la session.

Chaque profil est joué sur 200 apprenants par condition, soit **4 800 sessions** :

| Condition | Inattention réelle | Chance réelle | Hypothèses conservées par le moteur |
|---|---|---|---|
| Réponses tapées | 10 % | 5 % | 10 % / 5 % |
| Deux choix | 10 % | 50 % | 10 % / 50 % |
| Réponses tapées, bruit sous-estimé | 20 % | 15 % | 10 % / 5 % |

35 % des réponses non réussies deviennent « Je ne sais pas ». Ce partage ne change pas la probabilité totale de réussite.

Les tests permanents vérifient aussi l'absence d'erreurs sans bruit, le respect du budget, l'indépendance de `after`, la reproductibilité et le fait qu'une phrase répétée ne fournisse pas plusieurs preuves. Pour les conditions bruitées, ils exigent moins de 15 % d'erreurs parmi les points conclus pour chaque profil. Le minimum de couverture est de 20 % en réponse tapée et de 8 % en choix binaire : un choix binaire demande déjà quatre réussites pour dépasser 85 %, contre deux en réponse tapée. Ces seuils sont des garde-fous de régression, pas un objectif de couverture satisfaisant pour le produit.

## Résultats et limites

Le rapport reproductible donne, selon le profil :

| Condition | Questions moyennes | Points conclus | Erreurs parmi les points conclus |
|---|---|---|---|
| Réponses tapées | 39,23 à 39,69 | 28,99 à 68,30 % | 0,17 à 0,69 % |
| Deux choix | 39,91 à 39,98 | 11,25 à 49,53 % | 2,12 à 5,06 % |
| Réponses tapées, bruit sous-estimé | 39,52 à 39,89 | 24,70 à 61,39 % | 2,42 à 4,73 % |

La propagation à 99 % a été ajoutée après qu'une première simulation a révélé jusqu'à 39,29 % d'erreurs parmi les points conclus dans un profil à choix binaire, en propageant dès 85 %. La précision gagnée se paie par davantage de points incertains.

**40 questions ne permettent pas de conclure sur les 74 points à 85 % de confiance.** La simulation soutient l'emploi prioritaire de réponses tapées et des mini-tests ultérieurs ; elle ne valide pas un bilan complet A1–C1 en 40 questions. Le rapport conserve aussi l'erreur sur l'ensemble des points, la part incertaine, le score de Brier et l'erreur obtenue si l'on force malgré tout un classement binaire à p ≥ 0,5. Les incertains ne sont jamais comptés comme des réponses correctes.

Ces chiffres évaluent un modèle abstrait sous des hypothèses explicites. Ils ne mesurent ni la qualité des futures questions, ni la validité réelle des liens `requires`, ni la précision sur les trois utilisateurs de Lexora. Une banque sourcée et relue, une calibration sur des réponses réelles et une validation des résultats restent nécessaires avant activation. Les corrections manuelles et les mini-tests devront pouvoir rattraper les erreurs.

## Banque de questions (étape 1)

`public/grammar/en/placement.json`, produit par `scripts/placement-bank.ts` (module `src/core/learn/placementBank.ts`) et régénéré par la CI après les banques des leçons. Chaque question porte son énoncé (phrase à trou, traduction), sa réponse, sa source (`tatoeba:<id>`, CC BY 2.0 FR) et un statut (`généré` tant qu'une personne ne l'a pas relue). `evidenceId` est l'identifiant de la phrase : le moteur ne la compte jamais deux fois.

Règles, pour limiter le hasard (5 % en réponse tapée, 1 / n pour un choix) :

- exercice avec un verbe en indice : **réponse tapée** ;
- mots-outils : **choix élargi** par un distracteur sûrement faux, souvent le piège francophone (for / since / *during*, who / which / *what*, *too much old*, *mustn't* be, *use to*, le calque *isn't it*, l'ordre de l'affirmation dans *When will you…?*) ; a few / a little / few / little en 4 choix ;
- phrases de 25 à 90 caractères ; aucune question qui admet une autre réponse (prétérit sans repère, variante proche) ; le 3e conditionnel n'utilise que l'irréel du passé, le present perfect continu exige une durée, be used to a ses propres questions (tirées de la leçon used to) ;
- 8 questions au plus par point, natures de réponse alternées.

État : **168 questions pour 21 points** (13 points sans aucun choix à 2 ; say / tell, questions indirectes et une partie de too / enough et des question tags restent à 2 choix). Les **53 autres points** sont listés dans le fichier (`missing`, avec leur nombre de phrases Tatoeba traduites) : générateurs à écrire pour ceux qui ont assez de phrases, questions rédigées et relues pour les autres. Les taux de chance du moteur restent des hypothèses : une réponse tapée avec indice n'a souvent que deux formes plausibles (rains / will rain), ce qui la rapproche d'un choix ; la calibration sur des réponses réelles le dira.

## Banque réelle, règles superficielles et niveau global (2.23)

**Pourquoi les simulations abstraites ne suffisaient pas.** L'apprenant simulé répondait juste avec une probabilité 1 − 0,1 s'il connaissait le point, et au hasard (1 / propositions, 5 % en tapé) sinon. Avec la vraie banque, seuls le mode et le nombre de propositions changeaient : une banque où une seule forme suffit (toujours sans do, toujours to, pronom au milieu) passait inaperçue.

**Apprenants à règle superficielle** (`behaviour: 'shortcut'`, `src/core/learn/placementSimulation.ts`). Sur un point inconnu, ils appliquent la nature de réponse dominante du point (champ `form` de chaque question) au lieu du hasard, et, sans cette prise, écartent une proposition bizarre (hasard sur une proposition de moins). La mesure qui compte : la part des points **inconnus** classés « acquis » (`falseMasteryRate`).

**Ce que la mesure a révélé.** Avec le moteur de la 2.22, 7 à 13 % des points inconnus des profils A1 et A2 sortaient « acquis » chez ces apprenants, contre moins de 1 % au hasard. Cause principale, dans le modèle et non dans les phrases : réussir toutes les phrases d'une nature et rater les autres paraissait impossible sans connaître le point (5 % de hasard en réponse tapée), d'où un « acquis » que la déduction propageait aux prérequis (second conditionnel faussement acquis → premier conditionnel, will).

**Corrections du moteur.**

- `shortcutShare` (0,5) : pour un point dont les questions ont plusieurs natures de réponse, l'hypothèse « inconnu » mêle le hasard et, pour moitié, une règle unique (une nature réussie, les autres ratées). Ce schéma ne prouve plus rien ; réussir les deux natures, si.
- Les questions d'un point alternent les natures de réponse (la suivante est d'une nature encore peu posée).
- `globalLevel` (option, 0 par défaut dans le moteur, 2 dans l'application) : un niveau θ, comme dans les tests adaptatifs classiques, avec P(connu | θ) = logistique(2 × (θ − difficulté)), difficulté 0 pour A1 à 4 pour C1. Calcul bayésien exact sur une grille de θ, chaque réponse comptée une fois. Le niveau oriente le choix des questions et classe les points **jamais posés** à 99 % de confiance (`levelConfidence`), seulement jusqu'au plus haut niveau d'un point acquis en réponses directes (et « à apprendre » à partir du plus bas raté). Un point posé se classe sur ses seules réponses : une première version qui mêlait le niveau aux réponses classait « acquis » des points C1 après deux choix justes par chance.
- Périmètre de l'application : les 20 leçons et leurs prérequis (35 points), seuls points dont le résultat sert dans Apprendre.

**Résultats** (100 apprenants par profil, rapport : `docs/placement-simulation.json`, conditions `bank-*`) :

| Condition (vraie banque) | Points incertains, profils A1 à B1 | Débutant, B2, C1 | Faux acquis, règle superficielle |
|---|---|---|---|
| 74 points, moteur 2.22 (sans règle) | 54 à 71 % | 33 / 63 / 63 % | jusqu'à 13 % |
| 74 points, règle superficielle | 59 à 76 % | 44 / 66 / 66 % | moins de 0,5 % |
| 74 points, + niveau global | 47 à 69 % | 24 / 18 / 12 % | moins de 3 % |
| 35 points (leçons), + niveau global | 28 à 45 % | 6 / 7 / 7 % | moins de 2,5 % |

Le niveau global aide surtout les profils réguliers aux extrêmes ; il ne fait pas de miracle pour un apprenant A1 à B1, ni pour les profils irréguliers (lacunes, dispersés), qui restent incertains plutôt que mal classés. Seuil plus bas (0,95, ou 0,85 sans garde-fou) : beaucoup moins d'incertains mais 15 à 50 % de faux acquis pour ces profils irréguliers ; écarté.

**Un point incertain n'est pas une impasse** : à l'ouverture de sa leçon, un mini-test de 3 questions (natures alternées, même mise à jour bayésienne et même seuil) tranche avant les exercices.

Limites inchangées : profils binaires sans apprentissage, taux d'inattention et de hasard supposés, une seule règle superficielle par point ; la calibration sur des réponses réelles reste à faire.

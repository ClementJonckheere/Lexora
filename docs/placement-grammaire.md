# Placement grammatical : moteur, banque et validation

**État (2.25).** Le moteur (`src/core/learn/placement.ts`) est actif dans *Apprendre* depuis la 2.22 : test de 40 questions au plus sur les 52 leçons et leurs prérequis (52 points depuis la 2.25, 35 avant), niveau global et modèle de règle superficielle (2.23), résultats corrigeables enregistrés dans les réglages synchronisés (`placement`, par univers), mini-test de leçon pour les points que le test n'a pas tranchés. Les réponses brutes du test et des mini-tests sont conservées (vue Supabase `placement_answers`) pour l'analyse par question. Rien ne touche à FSRS ni à l'historique des leçons. La banque est générée depuis Tatoeba puis filtrée et relue (2.24 : 26 questions écartées sur les 35 points d'alors ; 2.25 : 136 questions des 17 nouveaux points relues, 5 écartées) ; les questions rédigées couvrent les 22 points sans leçon, hors du test actuel. Les sections ci-dessous retracent les étapes ; les chiffres de la 2.25 sont dans la dernière.

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

## Relecture de la banque générée, robustesse et analyse par question (2.24)

**Le test posait d'autres questions que celles relues.** Les 21 points des questions rédigées sont hors du périmètre des 35 points : le test posait 280 questions générées depuis Tatoeba, jamais relues. Leur relecture en a écarté 26 (`public/grammar/en/placement-excluded.json`, avec la raison), surtout des réponses tapées à deux réponses justes : plus-que-parfait et present perfect sans repère (« No one ___ anything », « Mary ___ on time »), present perfect continu avec « all day », prétérit irrégulier où le present perfect est juste aussi, try + -ing / to, if = whether, until + nom, « just now », much adverbe. En réponse tapée, une telle question fait rater une fois sur deux quelqu'un qui connaît le point, quand le modèle suppose 10 % : le point peut sortir « à apprendre » et entraîner ses dépendants.

**Filtres systématiques** (`placementBank.ts`, `placementBuilders.ts`, et les générateurs des leçons pour if = whether et try) : repère exigé pour le present perfect, d'antériorité pour le plus-que-parfait (sans wish ni if), for / since / how long pour le present perfect continu, repère passé pour le prétérit ; vraie proposition de temps et pas de question indirecte ; 2e conditionnel avec subordonnée au passé ; was admis à côté de were ; deux questions d'un point ne partagent ni une suite de trois mots ni un tour figé (if I were you, without…).

**Points qui mesuraient autre chose.** must / have to devient *mustn't* contre *don't have to* (la traduction tranche) ; will se mesure contre le calque du présent (« Je t'aide » → *I help you*) et le présent d'habitude contre will ; le présent simple alterne la 3e personne (tapée) et les autres personnes (base ou -s), pour que « toujours -s » ne suffise pas ; présent et prétérit continus : repère anglais (now, Look!, when, while), traduction sans « en train de ».

**Simulation hors des hypothèses du modèle** (`robustness` dans `docs/placement-simulation.json`, réglages de l'application, 60 apprenants par profil). Les apprenants appliquent, sur un point inconnu, une règle que le modèle ne connaît pas (toujours -s, proposition la plus longue, la plus courte comme approximation du calque) ou celle qu'il anticipe (nature dominante), avec une part de raccourci de 0,2 ou 0,8 (le modèle suppose 0,5) ; 15 % des questions peuvent être mal posées (ratées une fois sur deux par qui connaît le point). Résultat sur la banque régénérée par la CI (tout Tatoeba), pire profil : faux acquis de 1,2 à 2,8 % pour toutes les règles et toutes les parts de raccourci (« toujours -s » à 0,8 : 2,6 %, contre 4,5 % avec l'ancienne banque du présent simple, toute à la 3e personne) ; faux « à apprendre » 1,5 % sans questions mal posées et 4,2 à 4,9 % avec ; points incertains jusqu'à 51 % (profil A1), un peu plus qu'avant les filtres, qui retirent des questions tapées : le mini-test de leçon prend le relais. La simulation ne voit pas qu'une question précise est mauvaise : elle ne sait qu'en mesurer le coût moyen.

**Analyse par question, sur de vraies réponses.** C'est elle qui aurait signalé les 26 questions : une question souvent ratée par des gens qui réussissent les autres questions du même point est suspecte. La vue `placement_answers` (une ligne par réponse : utilisateur, univers, date, test ou mini-test, question, réponse) s'y prête directement, par exemple dans Qlik ou en SQL :

```sql
-- Taux de réussite d'une question chez ceux qui réussissent les autres questions de son point.
with a as (
  select user_id, answered_at, question_id, split_part(question_id, ':', 2) as point, response = 'correct' as ok
  from public.placement_answers
),
others as (
  select x.question_id, x.ok,
         avg((y.ok)::int) as autres_reussies
  from a x join a y on y.user_id = x.user_id and y.answered_at = x.answered_at and y.point = x.point and y.question_id <> x.question_id
  group by x.question_id, x.ok, x.user_id, x.answered_at
)
select question_id, count(*) as reponses, avg(ok::int) filter (where autres_reussies >= 0.75) as reussite_chez_les_bons
from others group by question_id order by reussite_chez_les_bons nulls last;
```

**Mini-test.** Questions tapées d'abord, puis à 3 propositions, les choix binaires en dernier ; autant de questions (3 à 5) qu'il faut pour que tout réussir au hasard tombe à 1 chance sur 16 (4 sur 4 en choix binaires, alors que 3 sur 3 arrive au hasard une fois sur 8) ; a priori neutre (0,5 au plus) plutôt que la probabilité du test ; « acquis » refusé si le hasard aurait pu suffire.

## Leçons A1 et A2 dans le périmètre (2.25)

**32 leçons A1 et A2** (`public/grammar/en/lessons.json`, texte lisible : [docs/lecons-a1-a2.md](lecons-a1-a2.md), à relire). Leurs exercices viennent des générateurs du placement, appliqués à tout Tatoeba par le workflow Grammaire (banques de 300 exercices au plus). Les questions du placement de ces points restent tirées des petites banques relues (`public/grammar/en/placement/<point>.json`), et les questions écartées à la relecture (`placement-excluded.json`) sont aussi retirées des exercices des leçons, B1 et B2 compris.

**Relecture des 17 points entrés dans le test** (adverbes de manière, articles, can, comparatifs, adverbes de fréquence, going to, have got, impératif, prétérit continu, questions au prétérit, possessifs, génitif, prépositions, should, there is, this / these, indénombrables ; les 15 autres points A1 et A2 y étaient déjà comme prérequis) : 136 questions, 5 écartées (deux prétérits continus où le prétérit simple est juste aussi, une phrase vulgaire, une politique, une de la série de faits divers Dan / Linda), et les remplaçantes relues à leur tour (3 écartées par les règles ci-dessous). Règles ajoutées : le prétérit continu écarte « was being » (passif) ; la liste de mots bloqués couvre aussi la sexualité explicite, les meurtres et la torture, des noms de dirigeants politiques et les personnages des séries de faits divers (Dan, Linda, Yidir).

**Simulation** (52 points, réglages inchangés) :

| Profil | Incertains 2.24 (35 points) | Incertains 2.25 (52 points) | Faux acquis 2.25 |
|---|---|---|---|
| Débutant | 4 % | 27 % | 1,7 % |
| Acquis jusqu'à A1 / A2 / B1 | 51 / 45 / 28 % | 67 / 60 / 38 % | 0,5 / 0,1 / 0,5 % |
| Acquis jusqu'à B2 / C1 | 7 / 8 % | 5 / 6 % | 0 % |
| Avancé avec lacunes, dispersés | 43 / 41 % | 61 / 57 % | 0,8 / 2,9 % |

Robustesse (règles inconnues du modèle, parts 0,2 et 0,8, 15 % de questions mal posées) : faux acquis au plus 3,8 % (2,8 % en 2.24), faux « à apprendre » au plus 1,0 % sans questions mal posées et 3,3 % avec.

**Limite assumée.** Avec 40 questions et au moins deux par point, le test tranche directement une vingtaine de points ; les 17 points A1 et A2 ajoutés ont peu de prérequis, la déduction les atteint peu, et le niveau global ne classe pas un point A1 chez un débutant sans une très forte certitude (une grille de θ étendue vers le bas a été essayée : 27 → 24,5 % d'incertains chez le débutant, mais faux acquis doublés chez les profils avancés irréguliers ; écartée). Les points incertains passent par le mini-test de leur leçon (3 à 5 questions). Pour un vrai débutant, « Commencer au début » reste plus simple que le test. Pistes si l'usage montre trop de mini-tests : test en deux temps (A1 et A2 d'abord, puis la suite selon le niveau), ou plus de questions pour les profils A1 et A2.

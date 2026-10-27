# Parcours de grammaire anglaise (brouillon à valider)

Généré depuis [`public/grammar/en/points.json`](../public/grammar/en/points.json) par `node scripts/grammar-doc.mjs` : modifier le JSON, pas ce fichier.

57 points, de A1 à C1. Chaque point : une explication courte, 3 à 5 exemples, puis des exercices tirés de phrases réelles (Tatoeba), révisés par FSRS.

- **Prérequis** : un point se débloque quand ses prérequis sont acquis ; le test de placement s’en sert pour déduire les points non testés.
- **Piège francophone** : erreur typique testée quel que soit le niveau (on peut être C1 et garder une erreur de A2).
- **Repérable** : peut être surligné dans vos livres de façon fiable (oui), avec des faux positifs (en partie), ou pas sans analyse grammaticale (non).

## A1 (14 points)

| Point | Exemple | Prérequis | Piège francophone | Repérable |
|---|---|---|---|---|
| **Le verbe to be au présent** `be` | She is tired. They aren't here. | - |  | oui |
| **Pronoms sujets, compléments et adjectifs possessifs** `pronouns` | I like her. His car is red. | - | its / his / her : le possessif s'accorde avec le possesseur, pas avec l'objet | oui |
| **Articles a / an / the et absence d'article** `articles` | Life is short. I love music. | - | pas de the pour une généralité (« La vie est courte » → Life is short) | en partie |
| **Pluriels et noms indénombrables** `plurals` | two children, some advice, information | - | advice, information, furniture, news sont indénombrables | en partie |
| **Démonstratifs this / that / these / those** `this-that` | These shoes are new. | Pluriels et noms indénombrables |  | oui |
| **Présent simple** `present-simple` | He works in London. | Le verbe to be au présent ; Pronoms sujets, compléments et adjectifs possessifs | le -s de la 3e personne (he work → he works) | en partie |
| **Questions et négations avec do / does** `do-questions` | Does she speak French? I don't know. | Présent simple | pas d'inversion du verbe (Speak you…? → Do you speak…?) | oui |
| **There is / there are** `there-is` | There are two cafés near here. | Le verbe to be au présent ; Pluriels et noms indénombrables |  | oui |
| **Have / have got (possession)** `have-got` | I've got a brother. Do you have a car? | Présent simple |  | oui |
| **Can / can't (capacité, permission)** `can` | Can you swim? I can't come. | Pronoms sujets, compléments et adjectifs possessifs |  | oui |
| **L'impératif** `imperative` | Sit down. Don't worry. | - |  | en partie |
| **Prépositions de temps et de lieu : in / on / at** `prepositions` | at 6 pm, on Monday, in July | - | on Monday, at night, in the morning | oui |
| **Adverbes de fréquence et leur place** `frequency-adverbs` | I always get up early. | Présent simple | avant le verbe (I go always → I always go), après be | oui |
| **Présent continu (be + -ing)** `present-continuous` | She's reading right now. | Le verbe to be au présent |  | oui |

## A2 (13 points)

| Point | Exemple | Prérequis | Piège francophone | Repérable |
|---|---|---|---|---|
| **Présent simple ou continu** `simple-vs-continuous` | I usually walk, but today I'm driving. | Présent simple ; Présent continu (be + -ing) | verbes d'état sans -ing (I am knowing → I know) | non |
| **Prétérit des verbes réguliers** `past-simple-regular` | We watched a film yesterday. | Présent simple |  | oui |
| **Prétérit des verbes irréguliers** `past-simple-irregular` | She went home and wrote a letter. | Prétérit des verbes réguliers |  | oui |
| **Questions et négations au prétérit (did)** `past-questions` | Did you see it? I didn't go. | Prétérit des verbes irréguliers ; Questions et négations avec do / does | did + base verbale (Did you went → Did you go) | oui |
| **Prétérit continu (was / were + -ing)** `past-continuous` | I was cooking when he called. | Prétérit des verbes irréguliers ; Présent continu (be + -ing) |  | oui |
| **Some / any, much / many, a lot of** `countables` | How much money? How many people? | Pluriels et noms indénombrables |  | oui |
| **Comparatifs et superlatifs** `comparatives` | bigger, more expensive, the best | Le verbe to be au présent | pas de « more bigger » ; than et non that | oui |
| **Le génitif 's et of** `possessive-s` | my sister's room, the end of the film | Pronoms sujets, compléments et adjectifs possessifs |  | oui |
| **Futur avec be going to** `going-to` | It's going to rain. | Présent continu (be + -ing) |  | oui |
| **Futur avec will (décision, prédiction)** `will` | I'll call you later. | Présent simple |  | oui |
| **Must / have to / should** `obligation` | You must stop. I have to work. You should rest. | Can / can't (capacité, permission) | mustn't (interdiction) ≠ don't have to (pas obligé) | oui |
| **Adverbes de manière (-ly)** `adverbs-manner` | She drives carefully. | Comparatifs et superlatifs |  | en partie |
| **Verbe + -ing ou verbe + to** `verb-patterns` | I enjoy cooking. I want to go. I want you to come. | Présent simple | want that you → want you to | en partie |

## B1 (16 points)

| Point | Exemple | Prérequis | Piège francophone | Repérable |
|---|---|---|---|---|
| **Present perfect (expérience, résultat)** `present-perfect` | Have you ever been to Rome? I've lost my keys. | Prétérit des verbes irréguliers |  | oui |
| **Present perfect ou prétérit** `perfect-vs-past` | I saw him yesterday. I've seen him today. | Present perfect (expérience, résultat) ; Questions et négations au prétérit (did) | le passé composé ne se traduit pas toujours par le present perfect (avec yesterday, ago : prétérit) | non |
| **For / since (durée jusqu'à maintenant)** `for-since` | I've lived here since 2019 / for five years. | Present perfect (expérience, résultat) | « J'habite ici depuis » → I've lived here, pas I live here since | oui |
| **Present perfect continu** `perfect-continuous` | She's been waiting for an hour. | For / since (durée jusqu'à maintenant) ; Présent continu (be + -ing) |  | oui |
| **Plus-que-parfait (had + participe)** `past-perfect` | When I arrived, the film had started. | Present perfect (expérience, résultat) ; Prétérit continu (was / were + -ing) |  | oui |
| **Used to / would (habitudes passées)** `used-to` | I used to smoke. | Prétérit des verbes irréguliers | used to (autrefois) ≠ be used to (avoir l'habitude) | oui |
| **Conditionnel réel (if + présent, will)** `first-conditional` | If it rains, we'll stay home. | Futur avec will (décision, prédiction) | pas de will après if (If it will rain → If it rains) | oui |
| **Conditionnel irréel (if + prétérit, would)** `second-conditional` | If I had time, I would travel. | Conditionnel réel (if + présent, will) ; Prétérit des verbes irréguliers | pas de would après if (If I would have → If I had) | oui |
| **Passif au présent et au prétérit** `passive` | The bridge was built in 1890. | Prétérit des verbes irréguliers ; Le verbe to be au présent |  | oui |
| **Relatives déterminatives (who / which / that, relatif omis)** `relatives-defining` | The man (who) I met was French. | Pronoms sujets, compléments et adjectifs possessifs |  | en partie |
| **Déduction au présent : must / might / can't** `deduction-present` | She must be tired. It can't be true. | Must / have to / should |  | en partie |
| **Discours rapporté (affirmations)** `reported-statements` | He said (that) he was tired. | Plus-que-parfait (had + participe) ; Futur avec will (décision, prédiction) |  | en partie |
| **Few / little / a few / a little** `quantifiers` | I have a few friends but little time. | Some / any, much / many, a lot of |  | oui |
| **Make ou do** `make-do` | make a mistake, do your homework | Présent simple | « faire » se traduit par l'un ou l'autre selon l'expression | oui |
| **Say ou tell** `say-tell` | She told me the truth. He said hello. | Discours rapporté (affirmations) | tell + personne (She said me → She told me) | oui |
| **Stop / remember / try + -ing ou + to (changement de sens)** `gerund-infinitive-meaning` | I stopped smoking. I stopped to smoke. | Verbe + -ing ou verbe + to |  | oui |

## B2 (9 points)

| Point | Exemple | Prérequis | Piège francophone | Repérable |
|---|---|---|---|---|
| **Conditionnel passé (if + had + participe)** `third-conditional` | If I had known, I would have come. | Conditionnel irréel (if + prétérit, would) ; Plus-que-parfait (had + participe) |  | oui |
| **Conditionnels mixtes** `mixed-conditionals` | If I had studied, I would be a doctor now. | Conditionnel passé (if + had + participe) |  | en partie |
| **Wish / if only (regrets, souhaits)** `wish` | I wish I knew. If only I had listened. | Conditionnel irréel (if + prétérit, would) ; Plus-que-parfait (had + participe) |  | oui |
| **Passif avec modaux et have something done** `passive-advanced` | It must be done. I had my hair cut. | Passif au présent et au prétérit |  | oui |
| **Relatives explicatives (virgules, which, whose)** `relatives-non-defining` | My brother, who lives in Paris, is a chef. | Relatives déterminatives (who / which / that, relatif omis) |  | en partie |
| **Déduction au passé : must have / might have / can't have** `deduction-past` | He must have missed the train. | Déduction au présent : must / might / can't ; Present perfect (expérience, résultat) |  | oui |
| **Discours rapporté : questions et ordres** `reported-questions` | She asked where I lived. He told me to wait. | Discours rapporté (affirmations) | pas d'inversion dans la question rapportée (asked where did I live → where I lived) | en partie |
| **Futur continu et futur antérieur** `future-forms` | This time tomorrow I'll be flying. I'll have finished by six. | Futur avec will (décision, prédiction) ; Present perfect (expérience, résultat) |  | oui |
| **Verbes à particule : place du complément** `phrasal-verbs` | Pick it up (pas pick up it). | Pronoms sujets, compléments et adjectifs possessifs | pronom entre le verbe et la particule | en partie |

## C1 (5 points)

| Point | Exemple | Prérequis | Piège francophone | Repérable |
|---|---|---|---|---|
| **Inversion après une négation (Never have I…)** `inversion` | Rarely do we see such talent. | Present perfect (expérience, résultat) ; Questions et négations avec do / does |  | oui |
| **Phrases clivées (What I need is…, It was… that…)** `cleft-sentences` | What I need is a holiday. | Relatives déterminatives (who / which / that, relatif omis) |  | en partie |
| **Propositions participiales** `participle-clauses` | Having finished, she left. Built in 1890, the house… | Plus-que-parfait (had + participe) ; Passif au présent et au prétérit |  | en partie |
| **Subjonctif formel (suggest that he go)** `subjunctive` | I suggest that he be told. | Discours rapporté : questions et ordres |  | en partie |
| **Insistance et nuance (do emphatique, hedging)** `emphasis` | I do like it. It would seem that… | Questions et négations avec do / does ; Déduction au passé : must have / might have / can't have |  | en partie |


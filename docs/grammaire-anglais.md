# Parcours de grammaire anglaise (brouillon à valider)

Généré depuis [`public/grammar/en/points.json`](../public/grammar/en/points.json) par `node scripts/grammar-doc.mjs` : modifier le JSON, pas ce fichier.

74 points de A1 à C1, 40 pièges francophones, 2 collections de notes.

- **Prérequis stricts** (`requires`) : on ne peut pas maîtriser le point sans eux. Seuls ces liens servent à déduire, dans le test de placement, les points non testés.
- **Après** (`after`) : ordre conseillé du parcours, jamais utilisé pour déduire.
- **Dépendants** : nombre de points qui dépendent strictement de celui-ci (impact d’une erreur de déduction).
- **Repérage** : précision mesurée du surlignage dans les livres, sur une cinquantaine de correspondances annotées (surligné seulement à partir de 90 % ; en dessous, le motif sert seulement à trouver des phrases d’exercice).
- **Pièges** : testés à part, chacun sa fiche FSRS, hors déduction (on peut être C1 et garder une erreur de A1).

## A1 (18 points)

| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |
|---|---|---|---|---|---|
| **Le verbe to be au présent** `be` | She is tired. They aren't here. | - | - | 11 | à mesurer |
| **Prétérit de be : was / were** `was-were` | I was at home. Were you tired? | Le verbe to be au présent | - | 3 | à mesurer |
| **Pronoms sujets et compléments** `subject-object-pronouns` | She likes him. They called us. | - | - | 3 | à mesurer |
| **Adjectifs et pronoms possessifs** `possessive-adjectives` | my, your, his, her, its, their ; mine, yours | - | - | 0 | à mesurer |
| **Articles a / an / the** `articles` | a book, an apple, the sun | - | - | 0 | à mesurer |
| **Formes du pluriel** `plural-forms` | boxes, cities, children, men | - | - | 2 | à mesurer |
| **Démonstratifs this / that / these / those** `this-that` | These shoes are new. | - | Formes du pluriel | 0 | à mesurer |
| **Adjectif : place et invariabilité** `adjectives` | a red car, different ideas | - | - | 0 | à mesurer |
| **Présent simple** `present-simple` | He works in London. | - | Le verbe to be au présent ; Pronoms sujets et compléments | 18 | à mesurer (faux positif : formes identiques au prétérit ou à l'infinitif (put, cut)) |
| **Questions et négations avec do / does** `do-questions` | Does she speak French? I don't know. | Présent simple | - | 8 | à mesurer |
| **Questions avec mot interrogatif** `wh-questions` | Where do you live? What did she say? | Questions et négations avec do / does | - | 3 | à mesurer |
| **There is / there are** `there-is` | There are two cafés near here. | Le verbe to be au présent | Formes du pluriel | 0 | à mesurer |
| **Have / have got (possession)** `have-got` | I've got a brother. Do you have a car? | - | Présent simple | 0 | à mesurer (faux positif : have got = present perfect de get) |
| **Can / can't (capacité, permission)** `can` | Can you swim? I can't come. | - | Pronoms sujets et compléments | 0 | à mesurer (faux positif : can = boîte de conserve) |
| **L'impératif** `imperative` | Sit down. Don't worry. | - | - | 0 | à mesurer |
| **Prépositions de temps et de lieu : in / on / at** `prepositions-time-place` | at 6 pm, on Monday, in July | - | - | 0 | à mesurer (faux positif : chaque in / on / at : surligner n'apprend rien) |
| **Adverbes de fréquence et leur place** `frequency-adverbs` | I always get up early. She is never late. | Présent simple | - | 0 | à mesurer |
| **Présent continu (be + -ing)** `present-continuous` | She's reading right now. | Le verbe to be au présent | - | 5 | à mesurer (faux positif : be + adjectif en -ing (it is interesting)) |

## A2 (16 points)

| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |
|---|---|---|---|---|---|
| **Présent simple ou continu** `simple-vs-continuous` | I usually walk, but today I'm driving. | Présent simple ; Présent continu (be + -ing) | - | 0 | à mesurer |
| **Prétérit des verbes réguliers** `past-simple-regular` | We watched a film yesterday. | Présent simple | - | 7 | à mesurer (faux positif : -ed participe ou adjectif (he was tired)) |
| **Prétérit des verbes irréguliers** `past-simple-irregular` | She went home and wrote a letter. | Prétérit des verbes réguliers | - | 6 | à mesurer |
| **Participe passé (réguliers et irréguliers)** `past-participle` | She has gone home. The letter was written in 1850. | - | Prétérit des verbes irréguliers | 16 | à mesurer |
| **Questions et négations au prétérit (did)** `past-questions` | Did you see it? I didn't go. | Prétérit des verbes irréguliers ; Questions et négations avec do / does | - | 0 | à mesurer |
| **Prétérit continu (was / were + -ing)** `past-continuous` | I was cooking when he called. | Prétérit de be : was / were ; Présent continu (be + -ing) | Prétérit des verbes irréguliers | 0 | à mesurer (faux positif : was + adjectif en -ing (it was interesting)) |
| **Noms indénombrables** `uncountables` | some advice, much information, furniture | - | Formes du pluriel | 0 | à mesurer |
| **Some / any, much / many, a lot of** `countables` | How much money? How many people? | Formes du pluriel | Noms indénombrables | 1 | à mesurer |
| **Comparatifs et superlatifs** `comparatives` | She is taller than me. It's the best day of my life. | - | Adjectif : place et invariabilité | 0 | à mesurer |
| **Le génitif 's et of** `possessive-s` | my sister's room, the end of the film | - | Adjectifs et pronoms possessifs | 0 | à mesurer (faux positif : 's = is ou has (she's gone)) |
| **Futur avec be going to** `going-to` | It's going to rain. | Présent continu (be + -ing) | - | 0 | à mesurer (faux positif : going to + lieu (I'm going to Paris)) |
| **Futur avec will (décision, prédiction)** `will` | I'll call you later. | - | Présent simple | 9 | à mesurer |
| **Obligation : must / have to** `must-have-to` | You must stop. I have to work. | - | Can / can't (capacité, permission) | 2 | à mesurer |
| **Conseil : should** `should` | You should rest. | - | Can / can't (capacité, permission) | 0 | à mesurer |
| **Adverbes de manière (-ly) et leur place** `adverbs-manner` | She drives carefully. I speak English well. | - | Adjectif : place et invariabilité ; Comparatifs et superlatifs | 0 | à mesurer |
| **Verbe + -ing ou verbe + to** `verb-patterns` | I enjoy cooking. I want you to come. | - | Présent simple | 1 | à mesurer |

## B1 (24 points)

| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |
|---|---|---|---|---|---|
| **Present perfect (expérience, résultat)** `present-perfect` | Have you ever been to Rome? I've lost my keys. | Participe passé (réguliers et irréguliers) | Prétérit des verbes irréguliers | 3 | à mesurer |
| **Present perfect ou prétérit** `perfect-vs-past` | I saw him yesterday. I've seen him today. | Present perfect (expérience, résultat) ; Prétérit des verbes irréguliers | Questions et négations au prétérit (did) | 0 | à mesurer |
| **For / since (durée jusqu'à maintenant)** `for-since` | I've lived here since 2019 / for five years. | Present perfect (expérience, résultat) | - | 0 | à mesurer (faux positif : since = parce que) |
| **Present perfect continu** `perfect-continuous` | She's been waiting for an hour. | Present perfect (expérience, résultat) ; Présent continu (be + -ing) | For / since (durée jusqu'à maintenant) | 0 | à mesurer |
| **Plus-que-parfait (had + participe)** `past-perfect` | When I arrived, the film had started. | Participe passé (réguliers et irréguliers) | Present perfect (expérience, résultat) ; Prétérit continu (was / were + -ing) | 5 | à mesurer |
| **Used to (habitudes passées)** `used-to` | I used to smoke. | - | Prétérit des verbes irréguliers | 0 | à mesurer (faux positif : be used to (passif de use : it was used to open)) |
| **Conditionnel réel (if + présent, will)** `first-conditional` | If it rains, we'll stay home. | Futur avec will (décision, prédiction) | - | 4 | à mesurer |
| **When / as soon as / until + présent** `time-clauses` | Call me when you arrive. | - | Conditionnel réel (if + présent, will) | 0 | à mesurer |
| **Conditionnel irréel (if + prétérit, would)** `second-conditional` | If I had time, I would travel. | Conditionnel réel (if + présent, will) ; Prétérit des verbes irréguliers | - | 3 | à mesurer |
| **Passif au présent et au prétérit** `passive` | The bridge was built in 1890. | Le verbe to be au présent ; Prétérit de be : was / were ; Participe passé (réguliers et irréguliers) | - | 1 | à mesurer (faux positif : be + adjectif en -ed (she was tired)) |
| **Relatives déterminatives (who / which / that, relatif omis)** `relatives-defining` | The man who called was French. | Pronoms sujets et compléments | - | 1 | à mesurer |
| **Déduction au présent : must / might / can't** `deduction-present` | She must be tired. It can't be true. | Obligation : must / have to | - | 1 | à mesurer |
| **Discours rapporté (affirmations)** `reported-statements` | He said that he was tired. | Plus-que-parfait (had + participe) ; Futur avec will (décision, prédiction) | - | 1 | à mesurer |
| **Few / little / a few / a little, every / each** `quantifiers` | I have a few friends but little time. | Some / any, much / many, a lot of | - | 0 | à mesurer |
| **Say ou tell** `say-tell` | She told me the truth. He said hello. | - | Discours rapporté (affirmations) | 0 | à mesurer |
| **Stop / remember / try + -ing ou + to (changement de sens)** `gerund-infinitive-meaning` | I stopped smoking. I stopped to smoke. | Verbe + -ing ou verbe + to | - | 0 | à mesurer |
| **Questions sur le sujet (sans do)** `subject-questions` | Who called you? What happened? | Questions avec mot interrogatif | - | 0 | à mesurer |
| **Le but : to + base verbale** `purpose-to` | I came to learn English. | - | - | 0 | à mesurer |
| **Préposition + -ing** `preposition-ing` | before leaving, I look forward to seeing you | - | - | 1 | à mesurer |
| **Questions indirectes** `indirect-questions` | Can you tell me where the station is? | Questions avec mot interrogatif | - | 1 | à mesurer |
| **Too / enough / so / such** `too-enough` | too expensive, old enough, so kind, such a nice day | - | Adjectif : place et invariabilité | 0 | à mesurer |
| **Make / let + base verbale** `make-let` | She made me wait. Let me go. | - | - | 0 | à mesurer |
| **Verbes à particule : place du complément** `phrasal-verbs` | Pick it up. Turn the light off. | Pronoms sujets et compléments | - | 0 | à mesurer |
| **Question tags, so do I / neither do I** `question-tags` | It's cold, isn't it? So do I. | Questions et négations avec do / does ; Le verbe to be au présent | - | 0 | à mesurer |

## B2 (11 points)

| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |
|---|---|---|---|---|---|
| **Conditionnel passé (if + had + participe)** `third-conditional` | If I had known, I would have come. | Conditionnel irréel (if + prétérit, would) ; Plus-que-parfait (had + participe) | - | 1 | à mesurer |
| **Conditionnels mixtes** `mixed-conditionals` | If I had studied, I would be a doctor now. | Conditionnel passé (if + had + participe) | - | 0 | à mesurer |
| **Wish / if only (regrets, souhaits)** `wish` | I wish I knew. If only I had listened. | Conditionnel irréel (if + prétérit, would) ; Plus-que-parfait (had + participe) | - | 0 | à mesurer |
| **Passif avec un modal** `passive-modals` | It must be done. It can't be fixed. | Passif au présent et au prétérit | - | 0 | à mesurer |
| **Have something done** `have-something-done` | I had my hair cut. | Participe passé (réguliers et irréguliers) | Passif au présent et au prétérit | 0 | à mesurer |
| **Relatives explicatives (virgules, which, whose)** `relatives-non-defining` | My brother, who lives in Paris, is a chef. | Relatives déterminatives (who / which / that, relatif omis) | - | 0 | à mesurer |
| **Déduction au passé : must have / might have / can't have** `deduction-past` | He must have missed the train. | Déduction au présent : must / might / can't ; Participe passé (réguliers et irréguliers) | Present perfect (expérience, résultat) | 0 | à mesurer |
| **Discours rapporté : questions et ordres** `reported-questions` | She asked where I lived. He told me to wait. | Discours rapporté (affirmations) ; Questions indirectes | - | 0 | à mesurer |
| **Futur continu** `future-continuous` | This time tomorrow I'll be flying. | Futur avec will (décision, prédiction) ; Présent continu (be + -ing) | - | 0 | à mesurer |
| **Futur antérieur** `future-perfect` | I'll have finished by six. | Futur avec will (décision, prédiction) ; Participe passé (réguliers et irréguliers) | - | 0 | à mesurer |
| **Be / get used to + -ing** `be-used-to` | I'm used to getting up early. | Préposition + -ing | Used to (habitudes passées) | 0 | à mesurer |

## C1 (5 points)

| Point | Exemple | Prérequis stricts | Après | Dépendants | Repérage |
|---|---|---|---|---|---|
| **Inversion après une négation (Never have I…)** `inversion` | Rarely do we see such talent. | Questions et négations avec do / does | Present perfect (expérience, résultat) | 0 | à mesurer |
| **Phrases clivées (What I need is…, It was… that…)** `cleft-sentences` | What I need is a holiday. | - | Relatives déterminatives (who / which / that, relatif omis) | 0 | à mesurer |
| **Propositions participiales** `participle-clauses` | Having finished, she left. Built in 1890, the house… | Participe passé (réguliers et irréguliers) | Plus-que-parfait (had + participe) ; Passif au présent et au prétérit | 0 | à mesurer |
| **Subjonctif formel (suggest that he go)** `subjunctive` | I suggest that he be told. | - | Discours rapporté : questions et ordres | 0 | à mesurer |
| **Do d'insistance** `emphatic-do` | I do like it. She did call. | Questions et négations avec do / does | Déduction au passé : must have / might have / can't have | 0 | à mesurer |

## Pièges francophones (40)

| Niveau | Piège | Faux | Juste | Point |
|---|---|---|---|---|
| A1 | L'âge avec be `be-age` | ~~I have 25 years.~~ | I'm 25. | Le verbe to be au présent |
| A1 | Faim, froid, raison… avec be `be-states` | ~~I have cold. You have right.~~ | I'm cold. You're right. | Le verbe to be au présent |
| A1 | Le possessif s'accorde avec le possesseur `its-his-her` | ~~The company changed his logo.~~ | The company changed its logo. | Adjectifs et pronoms possessifs |
| A1 | Le -s de la 3e personne `third-person-s` | ~~He work in London.~~ | He works in London. | Présent simple |
| A1 | People est un pluriel `people-plural` | ~~The people is angry.~~ | The people are angry. | Formes du pluriel |
| A1 | Pas d'inversion du verbe `no-inversion-questions` | ~~Speak you English?~~ | Do you speak English? | Questions et négations avec do / does |
| A1 | Do après le mot interrogatif `wh-no-do` | ~~Where you live?~~ | Where do you live? | Questions avec mot interrogatif |
| A1 | L'adjectif avant le nom, invariable `adjective-order` | ~~a car red, differents ideas~~ | a red car, different ideas | Adjectif : place et invariabilité |
| A1 | Can n'a ni do, ni to, ni futur `can-forms` | ~~Do you can? I will can.~~ | Can you? I will be able to. | Can / can't (capacité, permission) |
| A1 | L'adverbe de fréquence avant le verbe `frequency-adverb-position` | ~~I go always to work by bus.~~ | I always go to work by bus. | Adverbes de fréquence et leur place |
| A2 | Pas de pluriel pour advice, information… `uncountable-plural` | ~~some advices, informations~~ | some advice, information | Noms indénombrables |
| A2 | Rien entre le verbe et son complément `adverb-object-order` | ~~I speak very well English.~~ | I speak English very well. | Adverbes de manière (-ly) et leur place |
| A2 | Did + base verbale `did-base` | ~~Did you went there?~~ | Did you go there? | Questions et négations au prétérit (did) |
| A2 | Verbes d'état sans -ing `state-verbs-continuous` | ~~I am knowing the answer.~~ | I know the answer. | Présent simple ou continu |
| A2 | Must sans to `must-to` | ~~I must to go.~~ | I must go. | Obligation : must / have to |
| A2 | Mustn't (interdit) ≠ don't have to (pas obligé) `mustnt-dont-have-to` | ~~You mustn't come if you're busy.~~ | You don't have to come if you're busy. | Obligation : must / have to |
| A2 | Pas de more avec -er ; than `more-bigger` | ~~more bigger that~~ | bigger than | Comparatifs et superlatifs |
| A2 | The best in, pas of `best-in` | ~~the best restaurant of the world~~ | the best restaurant in the world | Comparatifs et superlatifs |
| A2 | Want + personne + to `want-that` | ~~I want that you come.~~ | I want you to come. | Verbe + -ing ou verbe + to |
| B1 | Suggest sans to `suggest-to` | ~~I suggest you to go.~~ | I suggest (that) you go. I suggest going. | Verbe + -ing ou verbe + to |
| B1 | Pas de the pour une généralité `zero-article-generic` | ~~The life is short. I love the music.~~ | Life is short. I love music. | Articles a / an / the |
| B1 | Moment passé précis : prétérit `passe-compose-calque` | ~~I have seen him yesterday.~~ | I saw him yesterday. | Present perfect ou prétérit |
| B1 | « Depuis » : present perfect `depuis-present` | ~~I live here since 2019.~~ | I've lived here since 2019. | For / since (durée jusqu'à maintenant) |
| B1 | Une durée : for `since-duration` | ~~since three years~~ | for three years | For / since (durée jusqu'à maintenant) |
| B1 | Pas de will après if `if-will` | ~~If it will rain, we stay home.~~ | If it rains, we'll stay home. | Conditionnel réel (if + présent, will) |
| B1 | Pas de will après when `when-will` | ~~When I will arrive, I'll call you.~~ | When I arrive, I'll call you. | When / as soon as / until + présent |
| B1 | Pas de would après if `if-would` | ~~If I would have time…~~ | If I had time… | Conditionnel irréel (if + prétérit, would) |
| B1 | Every + singulier `every-plural` | ~~every days~~ | every day | Few / little / a few / a little, every / each |
| B1 | Tell + personne `say-me` | ~~She said me the truth.~~ | She told me the truth. | Say ou tell |
| B1 | Explain to + personne `explain-me` | ~~Explain me the rule.~~ | Explain the rule to me. | Say ou tell |
| B1 | Question sur le sujet sans did `subject-question-did` | ~~Who did call you?~~ | Who called you? | Questions sur le sujet (sans do) |
| B1 | Le but : to, pas for `for-purpose` | ~~I came for learn English.~~ | I came to learn English. | Le but : to + base verbale |
| B1 | Après une préposition : -ing `preposition-to-infinitive` | ~~before to leave ; I look forward to see you~~ | before leaving ; I look forward to seeing you | Préposition + -ing |
| B1 | Pas d'inversion dans une question indirecte `indirect-question-order` | ~~Can you tell me where is the station?~~ | Can you tell me where the station is? | Questions indirectes |
| B1 | Too + adjectif, sans much `too-much-adj` | ~~too much expensive~~ | too expensive | Too / enough / so / such |
| B1 | Make / let sans to `make-to` | ~~She made me to wait.~~ | She made me wait. | Make / let + base verbale |
| B1 | Pronom entre le verbe et la particule `phrasal-pronoun` | ~~Pick up it.~~ | Pick it up. | Verbes à particule : place du complément |
| B1 | Le tag reprend l'auxiliaire `question-tag-isnt-it` | ~~You like it, isn't it?~~ | You like it, don't you? | Question tags, so do I / neither do I |
| B2 | Be used to + -ing `be-used-to-ing` | ~~I'm used to get up early.~~ | I'm used to getting up early. | Be / get used to + -ing |
| B2 | Pas d'inversion dans une question rapportée `reported-question-inversion` | ~~She asked where did I live.~~ | She asked where I lived. | Discours rapporté : questions et ordres |

## Hors grammaire : collections de notes

- **Make ou do (make a mistake, do homework…)** : Liste de collocations, pas une règle : collection de notes à importer, révisée par FSRS.
- **Verbes et adjectifs à préposition (depend on, listen to, wait for, good at…)** : Collection de notes à importer.

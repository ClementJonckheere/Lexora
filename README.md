# Lexora : carnet de vocabulaire multilingue & mémorisation espacée

Lexora est un **carnet de vocabulaire multilingue**, conçu pour enregistrer rapidement les expressions rencontrées en lisant, en regardant une vidéo, au travail ou dans une conversation, puis les mémoriser durablement. Les notes personnelles restent le cœur de l'application.
Lexora sert à :

1. **enregistrer** une expression en 5 secondes ;
2. l'**organiser** automatiquement (catégorie détectée, doublons, tags, collections) ;
3. la **retrouver** en 2 secondes (`Ctrl+K`) ;
4. la **mémoriser** par rappel actif ;
5. la **réviser au bon moment**, grâce à l'algorithme de répétition espacée **FSRS**.

Chaque langue est un **univers** (anglais, espagnol, chinois, portugais, russe, allemand…) avec sa propre bibliothèque, ses collections, ses révisions et ses statistiques.

La lecture de livres et l'onglet secondaire **Apprendre**, consacré à la grammaire anglaise, complètent ce carnet. **Pas d'IA générative dans l'application** : les phrases viennent de sources identifiées ; les explications de grammaire sont préparées hors de l'application, puis relues.

**État documenté : version 2.30.0.** Le parcours grammatical comporte 74 points de A1 à C1 et 40 pièges francophones ; les 74 points ont leur leçon et leurs exercices depuis la 2.31 (34 en A1 et A2, 26 en B1, 9 en B2 et 5 en C1 ; celles ajoutées depuis la 2.25 sont à relire). Le test de placement est disponible dans *Apprendre* ; le surlignage grammatical dans le lecteur ne l'est pas encore (voir [les chantiers restants](#8-état-de-validation-et-chantiers-restants)).

Application de bureau Windows **hors ligne d'abord** : la base SQLite locale permet de tout faire sans réseau. Avec un **compte Google** (via Supabase), les données se synchronisent entre appareils, en vue de la future application mobile. Aucun abonnement.
Configuration du compte et de la synchronisation : [docs/SUPABASE.md](docs/SUPABASE.md).

---

## 1. Concept

Le quotidien type tient en deux gestes :

| Moment | Geste | Coût |
|---|---|---|
| Je croise une expression | `N` (ou `Alt+Maj+L` depuis n'importe quelle application) → expression `Entrée` français `Entrée` exemple `Ctrl+Entrée` | ~5 s |
| Je change de langue | `Alt+1`, `Alt+2`… ou le sélecteur d'univers en haut de la barre latérale | 1 s |
| J'ai 2 minutes | J'ouvre Lexora → `Espace` (5 mots) ou `Entrée` (toutes les révisions du jour) → `Espace` pour dévoiler, `1`–`4` pour noter | quelques secondes par mot |

Tout le reste (planification, ordre, rythme, catégorie) est automatique.

## 2. Pages

Barre latérale : **sélecteur d'univers** (langue courante, nombre de fiches à réviser par langue), puis **Accueil · Bibliothèque · Réviser · Collections · Lecture · Apprendre · Statistiques · Paramètres**. En bas : le compte et l'état de synchronisation, **Rechercher (`Ctrl+K`)** et **+ Ajouter (`N`)**.

- **Connexion** (premier lancement) : « Continuer avec Google ». Le navigateur s'ouvre et l'application récupère la session. Elle reste ensuite connectée, y compris hors ligne.
- **Choix de la première langue** : grille de langues (anglais, espagnol, portugais, allemand, italien, russe, chinois, japonais, coréen, arabe, néerlandais, ou toute autre langue par son code ISO).

- **Accueil** : au centre, l'**ornement du rang** avec le niveau et la barre d'XP (un clic ouvre *Progression*), le nombre de fiches à réviser aujourd'hui et la **durée estimée** (calculée sur votre vitesse réelle), deux gros boutons (*Commencer la séance*, *Ajouter du vocabulaire*). Sous la ligne d'horizon : l'XP du jour et l'**objectif du jour** (nombre de réponses, réglable), les mots ajoutés cette semaine et la **série de jours consécutifs**, la taille de la bibliothèque. Les leçons de grammaire à réviser restent dans *Apprendre*. Puis la carte **Reprendre la lecture**, les **Premiers pas** (3 étapes, masquables), les derniers ajouts, les mots souvent oubliés et une petite progression (maîtrise et activité sur 14 jours).
- **Progression** (XP, niveaux, rangs) : l'XP récompense l'effort plutôt que le volume. Révision : 4 XP réponse tapée, 2 XP aux boutons, 1 XP pour un oubli, multipliés par l'ancienneté de la fiche (×1 le jour même, jusqu'à ×2 après six mois) ; grammaire : 5 XP réponse tapée juste, 2 XP choix juste, 1 XP une erreur ; leçon acquise 60 XP, révision de leçon réussie 25 XP ; mot ajouté 3 XP avec exemple, 1 XP sans (30 XP par jour au plus) ; entraînement libre 1 XP ; verbe irrégulier 4 XP les deux formes justes, 1 XP sinon ; lecture 2 XP par minute (2 heures comptées par jour au plus), livre fini 50 XP s'il a été lu au moins une heure. Une séance sans pause de plus de 2 minutes passe à ×1,25 après 10 minutes et ×1,5 après 25 ; la même fiche le même jour rapporte moitié moins à chaque fois. Niveau suivant : 120 × n^1,4 XP. Neuf rangs avec leur ornement : Fer (niveau 1), Bronze (5), Argent (10), Or (15), Platine (20), Diamant (30), Émeraude (40), Maître (50), Grand Maître (75). Tout se recalcule à partir de l'historique de l'univers (`src/core/progress/xp.ts`, `src/core/repo/xpRepo.ts`), sans table supplémentaire. Une réponse tapée est enregistrée dans `typed_answers` (synchronisée, toutes fiches) ; avant la 2.20, seules les réponses exactes sur des fiches en révision, sur l'appareil qui les avait reçues, comptaient comme tapées. Pendant une séance (révision, entraînement, exercices de grammaire), un pied de page discret indique les minutes sans pause, le palier atteint et l'XP gagnée (`FocusMeter`, mêmes règles que le calcul complet). **Temps de lecture** (2.26, `src/core/reading/readingTime.ts`, table `reading_sessions`, une ligne par ouverture d'un livre) : seul le temps actif compte, entre deux gestes (page tournée, touche, clic, molette, souris) espacés de 5 minutes au plus ; une fenêtre masquée ou sans le focus coupe la mesure, et une séance compte au plus 5 minutes par page tournée (un livre laissé ouvert ne rapporte rien). Le lecteur affiche les minutes de la séance en bas de page. La lecture n'entre pas dans les séances de concentration.
- **Titres** (*Progression*) : 17 distinctions gagnées par ce qu'on a accompli, déduites de l'historique ; un seul s'affiche à côté du rang, au choix (réglage synchronisé, par langue). Lecture : Tourne-page (un livre fini), Collectionneur de mondes (livres finis de 4 niveaux), Pilleur de chapitres (mots de 20 chapitres passés en revue), Grand lecteur (10 livres), Rat de bibliothèque (25 heures de lecture mesurées, à partir de la 2.26). Saisie : Archiviste de l'instant (médiane d'ajout sous 5 s, 7 jours de suite ; durée mesurée dans `note_entries` à partir de la 2.20), Dactylographe éclair (30 séances d'au moins 10 révisions, 95 % tapées). Grammaire : Architecte de la phrase (10 leçons acquises et 500 exercices justes), Gardien des règles (10 leçons réussies sur 3 révisions de suite), Dompteur d'irréguliers (100 verbes irréguliers maîtrisés, à partir de la 2.27). Mémorisation : Résilient (50 fiches oubliées puis retrouvées un autre jour), Stratège du temps (90 jours sans fiche en retard de plus de 2 jours), Mémoire longue (500 mots retrouvés après plus de 3 mois). Concentration : Constant (30 jours de pratique sur 40), Plongeur (10 séances de 45 min sans pause), Ascète (100 heures de séances), Polyglotte (deux langues au rang Argent). Calcul : `src/core/progress/titles.ts`. Un livre compte comme fini à 98 % ; les chapitres sont déduits des décisions de *Mots du chapitre* (au moins 3, regroupées à moins de 10 minutes d'écart).
- **Apparence** (*Paramètres → Apparence*) : fond clair ou sombre, ou celui de Windows ; polices Sora et DM Mono, fournies avec l'application. L'or est réservé à la progression.
- **Bibliothèque** : tableau compact et virtualisé (des milliers de lignes restent fluides). Recherche instantanée dans la langue de l'univers **et** en français, sans tenir compte des accents (ni du « to » initial en anglais). Les filtres se combinent : maîtrise, non maîtrisées, date d'ajout, catégorie, tag, collection, favoris. Tri par date, ordre alphabétique ou maîtrise. Le bouton **Masquer le français** (`H`) permet de s'autoévaluer : on clique sur une traduction pour la révéler. Un clic sur une ligne ouvre le détail : exemples, note, état FSRS de chaque direction, historique des réponses.
- **Réviser** : un gros bouton « Réviser les n fiches (environ x min) », des sessions courtes (5 / 10 / 20 mots) si l'on a peu de temps ; direction et filtres repliés sous *Options*. Pendant les premières révisions, le sens des 4 boutons est rappelé ; un mot oublié 4 fois est signalé avec une suggestion (exemple personnel, astuce, découper l'expression). En fin de session, un bilan : mots passés « maîtrisés », mots à surveiller, prochaine révision.
  - **Français → langue en contexte** : quand la note a un exemple contenant l'expression, le recto montre cette phrase avec un trou, la traduction en indice. L'exemple change à chaque révision.
  - **Réponse tapée** (par défaut) : la forme de la phrase (*figured … out*) ou l'expression sont acceptées, une faute de frappe compte comme « presque ». Lexora **propose la note** : faux → Oublié, presque → Difficile, exact → Retenu, exact et nettement plus rapide que d'habitude → Facile. « Habitude » = médiane du temps de réflexion de vos 200 dernières réponses exactes tapées dans cet univers, sur cet appareil (temps de saisie moins le temps de frappe de la réponse) ; « Facile » n'est jamais proposé sur une fiche nouvelle ou en réapprentissage, ni avant 20 réponses mesurées. `Entrée` l'accepte, `1` à `4` la change.
  On peut choisir la direction (les deux, français → langue ou langue → français) et limiter à une collection, une catégorie et/ou un tag (filtres combinables, mémorisés par langue, appliqués aussi à l'entraînement libre). Quatre modes d'**entraînement libre** : mots difficiles, phrases à trous, aléatoire et **écoute** (on entend l'expression, on tape ce qu'on a entendu ou son sens en français ; réécoute normale ou lente).
- **Collections** : listes personnalisées (Business English, Phrasal Verbs…). Une note peut appartenir à plusieurs collections. Chaque collection se révise et s'entraîne séparément.
- **Lecture** : des livres libres de droits dans la langue de l'univers (catalogue de [Project Gutenberg](https://www.gutenberg.org) via l'API [Gutendex](https://gutendex.com), sans clé). Les livres les plus lus de chaque langue (jusqu'à 200 en anglais), avec leur couverture et leur **niveau déjà estimé**, sont fournis avec l'application (`public/reading/catalog/*.json`, préparés chaque mois par la CI : `scripts/build-catalog.ts`, workflow « Catalogue de lecture ») : l'onglet *Découvrir* s'affiche instantanément, même hors ligne, et le filtre de niveau est immédiat. Le réseau ne sert qu'à chercher au-delà (« Plus de livres », recherche dans tout le catalogue) ; Gutendex étant parfois lent, au-delà de 12 s sans réponse le catalogue de gutenberg.org (flux OPDS) prend le relais.
  - *Découvrir* : couvertures, recherche par titre ou auteur, **niveau estimé** de chaque livre (A1 → C2) et filtre **Niveau maximum** pour n'afficher que les livres accessibles. Avec un filtre, la suite du catalogue est chargée automatiquement tant qu'il y a trop peu de livres adaptés.
  - **Test de vocabulaire** (3 à 4 minutes, sans IA) : environ 110 mots tirés de 11 tranches de fréquence (des 250 mots les plus courants au 50 000ᵉ), mêlés à 20 mots inventés. On répond seulement « je connais » / « je ne connais pas » (`→` / `←`, `Z` pour revenir). Répondre « je connais » à un mot inventé révèle une surestimation, corrigée tranche par tranche (p = (h − f) / (1 − f)), puis lissée (régression isotone : la part connue ne remonte pas dans les tranches rares). Les mots du test viennent d'une banque préparée par la CI à partir des livres de la langue : un mot n'y entre que s'il y est surtout écrit en minuscules, ce qui écarte les prénoms et noms de lieux des listes tirées de sous-titres. Précision vérifiée par des apprenants simulés sur de vrais livres (`vocabTest.test.ts`) : erreur médiane nulle, 80 % des estimations de couverture à ±3 points. Critère rappelé à chaque mot : *Je connais = je comprendrais ce mot dans une phrase.* En fin de test, les « je ne connais pas » sur des mots parmi les 1 000 plus courants sont à confirmer (une erreur de clic y coûte le plus). Les réponses brutes (mot, réponse, temps, correction) sont conservées dans `vocab_tests.answers` : le résultat peut être recalculé sans refaire le test, et analysé (Qlik, SQL : `jsonb_array_elements`).
  - **Recalage par la lecture** (`calibration.ts`, table `vocab_observations`) : les décisions de *Mots du chapitre* (*Je connais* / *Ajouter*) comptent comme des réponses de test supplémentaires. Un mot sélectionné en lisant prouve qu'il est inconnu, mais ne pas cliquer ne prouve pas qu'on le connaît : les clics ne servent qu'à **plafonner** une tranche (borne basse de Wilson de la part cliquée parmi les mots rencontrés dans les chapitres ouverts, à partir de 20 mots). La carte *Votre vocabulaire* montre le chiffre recalé et, tranche par tranche, la part prédite par le test face à ce que vous faites (avec le score de Brier des décisions).
  - **Couverture de vocabulaire** : chaque livre du catalogue indique la part de ses mots que vous connaissez (« 97 % connus »), calculée à partir de votre test et du profil de fréquence du livre (préparé par la CI ; noms propres exclus ; en anglais, une forme fléchie compte comme sa base : qui connaît *reply* connaît *replied*). **Recommandés pour vous** affiche les livres entre 95 et 98 % : on lit confortablement sans dictionnaire vers 98 %, avec effort vers 95 % (Hu & Nation, 2000), et il reste assez de mots nouveaux pour progresser. Pour les livres trouvés par la recherche en ligne, seul le niveau est indiqué.
  - *Mes livres* : couverture, progression ; la position de lecture est synchronisée entre appareils (le texte, lui, est téléchargé sur chaque appareil).
  - **Lecteur plein écran** en double page (une page si la fenêtre est étroite) : `←` `→`, `Espace`, molette ; `+` / `−` pour la taille du texte ; papier ivoire, blanc ou nuit ; police sans ou serif ; `T` table des chapitres ; `F` plein écran ; `Échap` pour quitter.
  - **Enregistrer un mot en lisant** : double-clic sur un mot (ou sélection d'une expression), puis `Entrée` dans la bulle. La fiche s'ouvre pré-remplie : l'expression (ponctuation et majuscule de début de phrase retirées), **la phrase du livre comme exemple** et la source (« Lu dans … ») ; il ne reste qu'à taper la traduction. Si l'expression est déjà dans vos fiches, la bulle affiche sa traduction et propose d'ajouter la phrase comme nouvel exemple. `P` la prononce. Aucun service externe n'est utilisé.
  - **Mots du chapitre** (`M`) : la couverture exacte du chapitre s'affiche en pied de page, et le bouton *Mots du chapitre* propose les 10 mots qui y reviennent le plus parmi ceux que vous ne connaissez sans doute pas (formes regroupées sous leur base). Pour chacun : *Je connais* ou *Ajouter* (fiche pré-remplie avec la phrase du livre) ; *Tout ajouter* crée les fiches d'un coup, traduction proposée avec la phrase comme contexte. Dans le texte, la bulle d'un mot sélectionné propose aussi *Je connais*. Vos marques (« connu ») et les mots de vos notes affinent le test : ils sont synchronisés entre appareils.
  - **Vos mots surlignés dans le livre** : les expressions déjà enregistrées (formes conjuguées comprises : « peeped » pour « to peep », « took it for granted » pour « to take for granted ») sont soulignées, traduction au survol ; le pied de page indique combien de vos mots le chapitre contient. *Mes mots : Surligner / Masquer*.
  - **Traduction dans la bulle** : la traduction française proposée s'affiche dès la sélection et pré-remplit la fiche (modifiable). Désactivable : *Paramètres → Traduction automatique*.
  - *Niveau estimé, sans IA* : sur un extrait du texte, on mesure combien de mots courants (liste de fréquence de la langue) il faut connaître pour comprendre 90 % du texte, et la longueur des phrases ; le chinois et le japonais sont mesurés par caractères. Calibré sur des livres de référence en anglais (Alice ≈ B1, Treasure Island ≈ B2, Pride and Prejudice ≈ B2/C1, Moby-Dick ≈ C2) ; pour les autres langues, un facteur mesuré sur leurs livres les plus lus (listes de 50 000 formes, flexions plus nombreuses) donne au classique « moyen » le même niveau qu'en anglais. C'est une indication, pas une certification ; le niveau est recalculé sur le texte entier au téléchargement.
- **Traduire et trouver un exemple** (formulaire d'ajout, `Ctrl+T`) : traduction française proposée par **[DeepL](https://www.deepl.com/fr/pro-api)** via une clé partagée gardée sur le serveur Supabase (fonction `translate`, voir [docs/SUPABASE.md](docs/SUPABASE.md) ; aucune clé à créer pour les utilisateurs), ou via une clé personnelle facultative (*Paramètres*). La phrase de l'exemple ou du livre lui est transmise comme contexte, ce qui donne le bon sens (« at last turned sulky » → « a fini par bouder ») ; sinon par [MyMemory](https://mymemory.translated.net) (gratuit, sans clé, environ 5 000 caractères par jour ; ses entrées de mémoire collaborative qui ne correspondent pas exactement au texte sont écartées au profit de sa traduction automatique) avec d'autres traductions possibles en un clic. « Traduire la phrase d'exemple » affiche le sens de la phrase entière, et phrases d'exemple réelles de [Tatoeba](https://tatoeba.org) (écrites et traduites par des bénévoles, avec leur traduction française ; « Autre exemple » pour en changer). Le [Wiktionnaire](https://en.wiktionary.org) ajoute la **nature du mot** (verbe, nom, adjectif…) et ses définitions. Seuls les champs vides sont remplis, tout reste modifiable et la saisie manuelle reste possible. Pas d'IA générative : rien n'est inventé.
- **Statistiques** : chiffres réels uniquement (voir §6).
- **Apprendre** (`Ctrl+6`, univers Anglais) : leçons de grammaire. Un index par niveau, chaque leçon avec sa barre de progression ; une leçon est **acquise à 18 bonnes réponses sur les 20 dernières** (un pourcentage sur moins de réponses serait trompeur). Une leçon acquise **revient en révision** à intervalles croissants (3 jours, 1 semaine, 16 jours, 5 semaines, 2 mois et demi, 5 mois) : 5 exercices, 4 justes pour la valider ; manquée, elle revient le lendemain et l'intervalle repart du début. Les leçons à réviser sont annoncées sur l'accueil et en tête d'*Apprendre* ; l'état se déduit des réponses déjà synchronisées (`src/core/learn/review.ts`), sans table supplémentaire. Chaque leçon : l'essentiel, la règle en quelques points, 6 à 8 exemples traduits (écoute), les pièges francophones, puis des **séances de 10 exercices sur de vraies phrases** Tatoeba avec leur traduction française (indice qui lève l'ambiguïté du trou), tirées au hasard dans une banque d'au plus 300 phrases par leçon (certaines banques sont plus petites ; tailles dans `public/grammar/en/exercises/index.json`) ; **Nouvelles phrases** relance un tirage. Exercices : forme à taper (verbe donné entre parenthèses, contractions acceptées) ou choix entre deux formes (`1` / `2`) ; correction immédiate ; les variantes (learnt / learned) et les autres réponses justes sont acceptées : le prétérit après after / before + sujet, ou pour un present perfect sans aucun repère. Une règle unique (« jamais will », « toujours le prétérit ») ne suffit pas : chaque exercice porte la nature de sa bonne réponse (will ou présent, would ou prétérit, present perfect ou prétérit, used to, be used to ou prétérit). Les séances alternent ces natures quand les effectifs le permettent ; la génération cherche aussi à équilibrer les banques. Le plafond de 60 % par forme dans les leçons à choix reste à garantir par des contrôles sur toutes les banques livrées (voir §8). Le trou tombe aussi dans la principale (*If it rains, we ___ home* → *will stay*), et les cas où will est juste après when (question directe et indirecte) sont exercés. *Cette phrase ne correspond pas à la leçon* retire la phrase (sa réponse ne compte pas) ; les phrases signalées sont aussi exclues des banques à la génération suivante pour tout le monde (fonction Supabase `grammar_reported_items`, qui ne renvoie que des comptes). Les phrases Tatoeba aux thèmes sensibles (violences, suicide, sexualité, affirmations politiques contestées) ou grossières sont écartées par [`scripts/grammar-blocklist.txt`](scripts/grammar-blocklist.txt). Leçons : en B1, present perfect, present perfect ou prétérit, for / since, plus-que-parfait, used to, conditionnels réel et irréel, when + présent, passif, say / tell, present perfect continu, relatives (who / which), few / little, stop / remember / try + -ing ou to, too / enough et so / such, question tags, questions indirectes, déduction must / can't ; en B2, wish / if only, 3e conditionnel (mêlé au 2e) (contenu : [`public/grammar/en/lessons.json`](public/grammar/en/lessons.json) ; banques : `public/grammar/en/exercises/`, générées par le workflow « Grammaire » avec `src/core/learn/exercises.ts`). Réponses enregistrées dans `grammar_answers` (synchronisée). **Verbes irréguliers** (2.27, carte dans *Apprendre*, `src/core/learn/irregularVerbs.ts`) : 144 verbes traduits, en trois niveaux de fréquence ; séance de 10 verbes (à revoir d'abord, puis 6 nouveaux au plus, les plus courants d'abord), prétérit et participe à taper (variantes admises : *burnt* / *burned*, *got* / *gotten*, *was* ou *were*), un verbe raté revient une fois en fin de séance. Chaque verbe a sa répétition espacée (1, 3, 7, 21 puis 60 jours après des réponses justes, aussitôt après une erreur) ; il est maîtrisé après 3 réponses justes de suite sur 3 jours différents. Réponses, formes tapées comprises, dans `verb_answers` (synchronisée). Liste de référence repliable avec l'état de chaque verbe. **Collections prêtes à importer** (2.28, page *Collections*, univers Anglais ; données `public/grammar/en/collections/`, statut « rédigé, à relire ») : *Make ou do* (40 collocations) et *Verbes et adjectifs à préposition* (60 : depend on, listen to, good at…), chacune avec une phrase d'exemple ; l'import crée des notes ordinaires (deux fiches FSRS, tag et collection à leur nom), sans doublon avec les expressions déjà présentes, et propose ensuite d'ajouter seulement celles qui manquent. Dans la phrase à trous, le « to » d'une préposition (*listen to*, *married to*) est désormais à taper comme le reste de l'expression ; seul celui de l'infinitif, en tête, reste affiché.
- **Grammaire anglaise (parcours et repérage)** : parcours de 74 points de A1 à C1 et 40 pièges francophones dans [`public/grammar/en/points.json`](public/grammar/en/points.json) (lisible dans [`docs/grammaire-anglais.md`](docs/grammaire-anglais.md), généré par `node scripts/grammar-doc.mjs`). Prérequis stricts (`requires`, seuls utilisés pour déduire) et ordre conseillé (`after`) séparés ; pièges à part (fiche propre, hors déduction). Les motifs disponibles (`src/core/learn/patterns.ts`, expressions régulières et listes de mots, dont 144 verbes irréguliers) servent à trouver des phrases candidates ; certains points n'ont pas de motif exploitable. **L'outil de mesure existe** : *Apprendre → mesurer le repérage* (outil avancé) présente des passages trouvés dans vos livres (ou Alice et Pride and Prejudice), à juger « juste » ou « faux positif ». Il calcule la précision et une borne basse de Wilson, et exporte les jugements ; `node scripts/grammar-precision.mjs export.json` les reporte dans `points.json`. **En 2.20.0, aucune précision mesurée n'y est encore enregistrée et le surlignage grammatical n'est pas intégré au lecteur.** Le surlignage des notes de vocabulaire, lui, est disponible. Le futur repérage grammatical exigera au moins 50 passages relus par point et une précision mesurée strictement supérieure à 90 % (voir §8). Le workflow « Grammaire (phrases Tatoeba) » compte pour chaque point les phrases Tatoeba candidates avec traduction française (`public/grammar/en/tatoeba-counts.json`) et alerte sous 30.
- **Paramètres** : compte et synchronisation, réglages de mémorisation, voix (une par langue), raccourci global, import/export, sauvegardes.

## 3. Parcours utilisateurs

**Ajouter** : `N` ouvre le formulaire, curseur dans « Expression ». `Entrée` passe au champ suivant et `Ctrl+Entrée` enregistre. Seuls l'expression et le français sont obligatoires. Pour le chinois, le japonais, le coréen, le russe et l'arabe, un champ **prononciation** (pinyin, romanisation…) apparaît directement ; pour les autres langues, il est disponible dans les options. L'exemple est facultatif et on peut en ajouter plusieurs. Les tags, collections, catégorie et note libre sont repliés par défaut. Les **doublons** sont signalés pendant la frappe, au sein de l'univers (« tackle an issue » = « To tackle an issue. » ; en espagnol, « año » ≠ « ano »), avec un lien pour ouvrir la note existante. L'option **Ajout en série** garde le formulaire ouvert pour enchaîner plusieurs expressions.

**Importer en masse** : `Ctrl+Maj+V` ouvre la fenêtre de collage, une expression par ligne :

```
To tackle an issue ; S'attaquer à un problème ; We need to tackle this issue.
To figure out	Comprendre / trouver            ← copié depuis Excel (tabulation)
To take for granted = Considérer comme acquis
```

Un aperçu indique pour chaque ligne si elle est valide, doublon ou en erreur. Un fichier CSV ou JSON peut aussi être importé, y compris depuis Anki ou Quizlet (les en-têtes français et anglais sont reconnus).

**Retrouver** : `Ctrl+K`, quelques lettres, et le résultat s'affiche avec sa traduction et sa maîtrise. `Entrée` l'ouvre et `Ctrl+Entrée` le modifie. Si rien ne correspond, `Entrée` propose de l'ajouter.

**Réviser** : écran épuré, sans barre latérale. La question s'affiche, `Espace` dévoile la réponse (expression, exemples, prononciation), puis on note `1` Oublié · `2` Difficile · `3` Retenu · `4` Facile, et la fiche suivante arrive. Chaque bouton affiche l'intervalle qui en résulterait (« 10 min », « 4 j »…). `Z` annule la dernière réponse, `E` corrige la note sans quitter la session, `P` prononce, `Échap` quitte. Aucune souris n'est nécessaire.

## 4. Choix techniques

| Couche | Choix | Pourquoi |
|---|---|---|
| Application de bureau | **Tauri 2** | Installateur Windows léger (quelques Mo), démarrage rapide, utilise WebView2 intégré à Windows 10/11. |
| Interface | **React 19 + TypeScript**, Vite, Zustand, CSS maison | Composants réutilisables, état central minimal, aucun framework CSS lourd. |
| Base de données | **SQLite** (rusqlite, SQLite embarqué) | Un fichier local, transactions, mode WAL. |
| Compte & synchronisation | **Supabase** (Auth Google + PostgreSQL avec RLS) | Comptes gérés, sécurité par ligne, offre gratuite suffisante ; même compte sur PC et mobile. |
| Répétition espacée | **FSRS** via `ts-fsrs` (bibliothèque de référence de l'Open Spaced Repetition) | Algorithme moderne, plus précis que SM-2 (Anki historique). |
| Prononciation | Enregistrements de vraies personnes ([Wiktionnaire](https://en.wiktionary.org) / Wikimedia Commons, dont [Lingua Libre](https://lingualibre.org)), sinon **voix naturelle** neuronale ([Azure AI Speech](https://learn.microsoft.com/azure/ai-services/speech-service/) via la fonction Supabase `speak`, clé côté serveur, sons gardés en cache sur l'appareil), sinon synthèse vocale du système (Web Speech API, voix « Natural » de Windows préférées) | Prononciation claire et naturelle ; voix Windows locales, hors ligne, en secours. Réglages : *Paramètres → Prononciation enregistrée* et *Voix naturelle* ; installation : [docs/SUPABASE.md](docs/SUPABASE.md). |
| Tests | Vitest (logique métier sur une vraie base SQLite en mémoire via sql.js), synchronisation contre PostgreSQL + PostgREST réels, `cargo test` (couche native) | |

**Séparation des responsabilités** :

```
src/
  core/                 ← logique métier pure, sans React (testée)
    db/                 abstraction SQLite, migrations, pilotes (Tauri / navigateur / tests)
    domain/             types, validation, normalisation, doublons, catégorisation,
                        phrases à trous, CSV, recherche & filtres, dates, réglages
    srs/                FSRS (scheduler), file de révision, session, entraînement libre
    repo/               accès aux données : univers, notes, collections, révisions, stats, import/export
    sync/               moteur de synchronisation (hors ligne d'abord), client Supabase
    reading/            catalogue, livres, couverture lexicale, test de vocabulaire et recalage
    learn/              points de grammaire, motifs, exercices, annotation, progression et révision
    platform/           compte Google, fichiers, synthèse vocale, raccourci global
  app/                  état applicatif (store), planification de la synchro, import/export
  ui/                   composants React (components/) et pages (features/)
src-tauri/              couche native Rust : connexion SQLite, sauvegardes, fichiers, retour OAuth
supabase/schema.sql     tables PostgreSQL, déclencheurs, règles RLS (à exécuter dans Supabase)
```

Le Rust reste volontairement mince : il expose une connexion SQLite unique (`db_select`, `db_execute`), la lecture et l'écriture des fichiers choisis dans une boîte de dialogue, les sauvegardes automatiques, et un mini-serveur `127.0.0.1` qui reçoit le retour de la connexion Google. Les transactions (`BEGIN IMMEDIATE … COMMIT`) sont pilotées depuis TypeScript sur cette connexion unique, et toutes les requêtes passent par un verrou asynchrone : une transaction n'est jamais entrelacée avec une autre requête.

Le même code SQL tourne dans les trois environnements. Dans l'application, c'est rusqlite. Avec `npm run dev`, un aperçu navigateur utilise sql.js (WebAssembly), persisté dans IndexedDB. Les tests utilisent sql.js en mémoire.

## 5. Modèle de données

Le schéma SQLite est en **version 11** (`PRAGMA user_version`), indépendamment de la version 2.30.0 de l'application. Les **16 tables synchronisées** partagent un modèle commun avec PostgreSQL. Les listes exhaustives sont dans [`src/core/db/migrations.ts`](src/core/db/migrations.ts), [`src/core/db/migrationV2.ts`](src/core/db/migrationV2.ts), [`src/core/sync/tables.ts`](src/core/sync/tables.ts) et [`supabase/schema.sql`](supabase/schema.sql).

| Table | Clé locale | Principales données |
|---|---|---|
| `universes` | `id` | Nom, langue ISO, position, plafond `new_per_day`, création |
| `notes` | `id` | Expression, traduction, prononciation, clé de doublon, commentaire, catégorie, favori, suspension, exemples, tags, collections, création |
| `collections` | `id` | Univers, nom, description, création |
| `cards` | `id` | Note, direction (`fr_en` / `en_fr`), état FSRS, échéance, stabilité, difficulté, intervalles, répétitions, oublis, dernière révision |
| `review_logs` | `id` | Fiche, note 1–4, état FSRS avant la réponse, date de révision, durée |
| `practice_logs` | `id` | Note, mode d'entraînement, résultat, date |
| `books` | `book_key` | Univers, métadonnées du livre, niveau, chapitre, bloc, progression, dernière lecture |
| `word_marks` | `mark_key` | Univers, mot, connu / inconnu |
| `vocab_tests` | `universe_id` | Dernier test : tranches, taille estimée, fausses alarmes, réponses brutes, date |
| `vocab_observations` | `obs_key` | Univers, source (`chapter`, `select`, `exposure`), mot, rang, connu / inconnu, date |
| `grammar_answers` | `id` | Univers, leçon, exercice, réponse correcte ou non, signalement, date |
| `note_entries` | `id` | Univers, note, durée de saisie d'un mot ajouté depuis le formulaire, date |
| `typed_answers` | `log_id` | Révision dont la réponse a été tapée (XP d'une réponse tapée), univers, date |
| `settings` | `key` | Réglages partagés entre appareils |

- Les lignes synchronisées portent `updated_at` (millisecondes), `deleted` (suppression douce) et `dirty` (local : à envoyer). **Exception : `settings` n'a pas de colonne `deleted`.** Supabase ajoute `user_id` et `server_updated_at` ; `dirty` reste local.
- Les colonnes de listes sont stockées en JSON texte dans SQLite et en `jsonb` dans PostgreSQL.
- Restent **locaux** : `device_settings`, `sync_state`, `book_texts` (texte et couverture téléchargés), `book_levels` (cache des niveaux), ainsi que `review_logs.typed_ms` et `typed_chars` (mesures de saisie propres à l'appareil).
- Les univers, notes, collections, fiches et lignes d'historique utilisent des **UUID**. Les autres tables utilisent des clés métier stables (livre, mot, observation, réglage) ou l'identifiant de l'univers.
- Chaque note crée **deux fiches**, une par direction : la maîtrise est suivie **séparément**.
- Les **suppressions sont douces** (`deleted = 1`) pour se propager aux autres appareils.
- Les **migrations** sont versionnées (`PRAGMA user_version`, `src/core/db/migrations.ts`). Chacune s'applique dans sa propre transaction. La v2 a converti la base v1 sans perte : notes, exemples, tags, collections, fiches et historique sont rangés dans un univers « Anglais ».

Une évolution de schéma synchronisé demande quatre mises à jour : **nouvelle migration locale versionnée**, **`supabase/schema.sql` idempotent**, **`src/core/sync/tables.ts`** et **consigne « relancer schema.sql » dans ce README**. Les migrations déjà publiées restent inchangées. Toute modification du schéma Supabase doit être approuvée avant sa mise en œuvre.

### Synchronisation

Le moteur (`src/core/sync/engine.ts`) fonctionne **hors ligne d'abord** :

1. toute écriture locale marque la ligne `dirty` et met à jour `updated_at` ;
2. un cycle **reçoit** d'abord, table par table, ce qui a changé sur le serveur depuis le dernier curseur `server_updated_at`. Une ligne reçue n'écrase la ligne locale que si elle est plus récente ;
3. puis il **envoie** les lignes `dirty`. Côté serveur, un déclencheur PostgreSQL refuse qu'une version plus ancienne remplace une plus récente ;
4. **RLS** : chaque compte ne lit et n'écrit que ses propres lignes (`user_id = auth.uid()`).

La synchronisation se déclenche quelques secondes après chaque modification, toutes les 2 minutes, au retour du réseau, quand la fenêtre reprend le focus, ou via le bouton *Synchroniser*. L'historique des révisions est en ajout seul : les révisions faites sur plusieurs appareils s'additionnent.

## 6. Logique de mémorisation

**FSRS** modélise chaque fiche par sa *stabilité* (nombre de jours au bout duquel la probabilité de rappel tombe à 90 %) et sa *difficulté*. Après chaque réponse, il calcule la prochaine date pour viser la **rétention souhaitée** (90 % par défaut, réglable). Le modèle utilise actuellement les paramètres par défaut de `ts-fsrs` ; l'optimisation à partir de l'historique de chaque utilisateur reste à développer (voir §8).

- **Nouvelle expression** : étapes courtes (1 min, 10 min) dans la session, puis intervalles en jours.
- **Oubliée** (`1`) : la fiche passe en réapprentissage, revient dans la session quelques cartes plus loin, sa stabilité chute et l'oubli est compté.
- **Retenue plusieurs fois** : les intervalles s'allongent progressivement (jours → semaines → mois).
- **Ordre d'une session** : fiches en cours d'apprentissage, puis révisions dues (les plus menacées d'oubli d'abord, selon leur probabilité de rappel actuelle), puis nouveaux mots répartis entre les révisions. Les nouveaux mots arrivent **par utilité** : les plus fréquents dans la langue d'abord (rang du mot le plus rare de l'expression, listes de fréquence fournies), à égalité par date d'ajout. Un mot en attente depuis plus de 14 jours passe devant, pour qu'un mot rare relevé en lisant ne reste pas bloqué ; *Paramètres → Ordre des nouveaux mots* permet de revenir à l'ordre d'ajout.
- **Plafond de nouveaux mots par jour** (10 par défaut). Un mot est « introduit » quand sa fiche FR→EN est vue pour la première fois. La fiche EN→FR n'est proposée qu'à partir du lendemain, et deux fiches d'une même note ne se suivent jamais.
- **FR→EN est prioritaire** : c'est la direction qui sert à parler spontanément. On peut aussi réviser une seule direction.
- **Consulter n'est pas réviser** : ouvrir une note, la chercher ou masquer/afficher sa traduction dans la bibliothèque ne touche jamais à la planification. Seule une réponse dans une session planifiée met FSRS à jour.
- L'**entraînement libre** (aléatoire, mots difficiles, phrases à trous, écoute) est enregistré dans l'historique (`practice_logs`) mais **ne modifie jamais** les dates de révision.
- **Phrases à trous** : construites uniquement à partir de **vos** exemples. Les mots de l'expression y sont repérés, formes fléchies et verbes irréguliers compris (*figured … out*, *took … for granted*). La correction tolère une autre forme du même mot.
- **Mots difficiles** : au moins 2 oublis (hors toute première présentation).

**Niveaux de maîtrise** (critère explicite) :

| Niveau | Critère |
|---|---|
| À apprendre | jamais révisée |
| En cours | en apprentissage, ou stabilité < seuil |
| **Maîtrisée** | phase « révision » **et** stabilité FSRS ≥ **21 jours** (réglable) ; pour une note : dans toutes les directions actives |

**Statistiques** : total, ajouts de la semaine, fiches dues, maîtrisées, rétention **mesurée** sur 30 jours (part des révisions espacées retrouvées), mémorisation **estimée** (probabilité moyenne de rappel FSRS à l'instant), révisions par jour, prévision sur 7 jours, série de jours actifs, expressions les plus difficiles.

## 7. Design

Thème clair, fond blanc cassé, indigo comme couleur d'action, gris très clairs pour les surfaces. Typographie Inter, embarquée pour fonctionner hors ligne. Transitions de 120 à 160 ms. Les raccourcis sont rappelés à côté des boutons. Les couleurs de maîtrise (gris, ambre, vert) et de notation (rouge, ambre, vert, indigo) sont cohérentes partout. Une seule action principale par écran.

## 8. État de validation et chantiers restants

### À valider ou corriger sur l'existant

- **Contenu grammatical** : les 10 premières leçons B1 ont été relues ; les 10 suivantes, du present perfect continu au 3e conditionnel, et les 32 leçons A1 et A2 (2.25) restent à relire. Grille : règle juste, exemple net, traduction exacte, piège couvert par une règle et exercices cohérents.
- **Qualité des banques** : les tests couvrent des cas du générateur, mais les contrôles systématiques sur toutes les banques livrées restent à ajouter en CI : aucune forme au-delà de 60 % des bonnes réponses dans une leçon à choix ; aucun repère passé incompatible avec un present perfect (hors emploi après `since`) ; futur français cohérent avec une réponse `will` ; trou sur le verbe dans les exercices verbaux ; distracteurs accordés et correctement orthographiés ; aucun mot de `scripts/grammar-blocklist.txt`.
- **Signalements** : le chemin existe dans le code, mais le parcours complet reste à valider depuis Lexora Windows connecté : signaler une phrase, synchroniser, contrôler `grammar_answers` et `grammar_reported_items` dans Supabase, relancer le workflow Grammaire, puis contrôler l'exclusion de l'exercice. Un appel réussi à la fonction Supabase ne valide pas à lui seul ce parcours.

### Les six chantiers de développement

Un premier lot du **moteur de placement** est implémenté en logique pure, avec des simulations permanentes sur les 74 points : [`src/core/learn/placement.ts`](src/core/learn/placement.ts), [méthode et limites](docs/placement-grammaire.md), [rapport chiffré reproductible](docs/placement-simulation.json). **Interface (2.22)** : à la première visite d'*Apprendre*, « Faire le test » / « Commencer au début » / « Plus tard ». Le test pose 40 questions au plus, sans correction en cours de route, avec « Je ne sais pas » (`Ctrl+Entrée`) ; les résultats (acquis, à consolider, à apprendre, avec la nature de la preuve : testé, déduit, non testé) sont corrigeables point par point et enregistrés dans les réglages synchronisés (`placement`, par univers), sans table supplémentaire. *Apprendre* indique alors la leçon par laquelle commencer et l'état issu du test sur les leçons pas encore commencées ; le test se refait à tout moment. **2.23** : le test porte sur les 20 leçons et leurs prérequis (35 points), avec un niveau global et un modèle de règle superficielle qui empêche une forme unique (toujours sans do, toujours to…) de passer pour un acquis ; une leçon que le test n'a pas tranchée propose un mini-test de 3 questions avant les exercices (méthode et chiffres : [docs/placement-grammaire.md](docs/placement-grammaire.md)). **2.25** : 32 leçons A1 et A2 (exercices tirés des générateurs du placement, [texte à relire](docs/lecons-a1-a2.md)) ; le test porte donc sur 52 points, dont 17 nouveaux relus question par question ; plus de points restent « à consolider » chez les profils A1 et A2 (jusqu'à 67 %), tranchés par le mini-test de leçon. **Banque de questions** (`public/grammar/en/placement.json`, `scripts/placement-bank.ts`) : questions tirées des banques des 20 leçons et, depuis l'étape 2, des générateurs des points A1 et A2 sans leçon ([`src/core/learn/placementBuilders.ts`](src/core/learn/placementBuilders.ts), banques `public/grammar/en/placement/<point>.json` produites par le workflow Grammaire sur tout Tatoeba). Chaque générateur ne garde que les phrases où la réponse est certaine : la traduction française tranche (où / quand, passé / présent), ou les autres propositions sont sûrement fausses (*can to swim*, *advices*, *didn't went*) ; une forme à taper est préférée à un choix. Les points restants (*adjectives*, *simple-vs-continuous* et 19 points B1 à C1 sans leçon) ont 6 questions rédigées chacun (étape 3, `public/grammar/en/placement-written.json`, statut « rédigé », à relire : [liste lisible](docs/placement-questions-redigees.md)). Les 74 points du parcours ont ainsi des questions. Rejouer le rapport avec `npm run simulate:placement` ; les tests sont inclus dans `npm test` et la CI existante. Une conclusion directe exige 85 % de confiance et au moins deux réponses ; sa propagation par `requires` exige 99 %. `after` est ignoré et les pièges restent indépendants.

Les chantiers suivants restent **indisponibles dans l'interface** :

| Ordre proposé | Chantier | Périmètre et validation attendus |
|---|---|---|
| 1 | **Placement grammatical A1–C1** (interface en 2.22) | Fait : banque des 74 points, test, résultats corrigeables, leçon conseillée. Fait aussi (2.23) : mini-test de 3 questions au début des leçons, simulation sur la banque réelle avec apprenants à règle superficielle, niveau global. Reste : relire les questions générées, calibrer sur des réponses réelles. |
| 2 | **Repérage grammatical dans le lecteur** | Intégrer les motifs au lecteur après relecture d'au moins 50 passages par point et mesure d'une précision strictement supérieure à 90 %. Conserver les jugements et des cas annotés comme tests permanents ; une simulation du mécanisme ne remplace pas une mesure humaine de la justesse des passages. |
| 3 | **Phrases choisies à la main** | Compléter les points peu fournis dans Tatoeba : conditionnel mixte (16 candidats avec traduction française), subjonctif (36), selon le comptage du 29 octobre 2026. Ces comptes sont des candidats à relire, pas des exercices validés. Conserver les sources et les traductions relues ; préserver la banque complémentaire lors des régénérations. |
| 4 | **Verbes irréguliers et collections** | Module d'entraînement aux trois formes des verbes irréguliers. Collections make / do et verbes ou adjectifs à préposition, importables comme notes avec leurs deux fiches FSRS. Fait : module de verbes (2.27, *Apprendre*) et collections prêtes à importer (2.28, *Collections*). |
| 5 | **FSRS personnel et analyse Qlik** | Optimiser les paramètres sur `review_logs` par utilisateur et univers, après quelques centaines de révisions ; comparer la calibration avant / après sur des révisions mises de côté. Préparer un export documenté et des vues SQL pour Qlik Cloud avec accès en lecture seule : prédit / observé, rétention par direction, temps de réponse, mots à problème, progression grammaticale et signalements. |
| 6 | **Shadowing** | Écouter une phrase, la répéter au micro, réécouter et comparer. Première étape : enregistrement local avec `MediaRecorder`. Une évaluation de prononciation Azure via une fonction Supabase pourra venir ensuite ; elle n'est pas implémentée. |

**Limite à mesurer pour le placement** : 40 questions avec au moins deux questions par point permettent de tester directement 20 points au maximum. Les autres points ne peuvent être déduits que si `requires` fournit des éléments suffisants ; les résultats incertains doivent rester signalés comme tels. La simulation doit évaluer cette limite avant toute mise en ligne.

**2.29** : 6 leçons B1 (discours rapporté, questions sur le sujet, but avec to, préposition + -ing, make / let, phrasal verbs), exercices tirés de Tatoeba par `src/core/learn/lessonBuilders.ts` ; dans le test de placement, ces points gardent leurs questions rédigées, prioritaires sur la banque générée. Les propositions des exercices sont mélangées à l'affichage (ordre fixé par exercice) : dans les leçons A1 et A2 de la 2.25, la bonne réponse était toujours la première. **2.30** : 9 leçons B2 (conditionnels mixtes, passif avec modal, have something done, relatives explicatives, déduction au passé, questions et ordres rapportés, futur continu, futur antérieur, be used to). Les conditionnels mixtes étant rares dans Tatoeba, leurs exercices portent sur toutes les phrases en if… would : would + base ou would have + participe, selon la traduction (conditionnel présent ou passé). **2.31** : les 7 dernières leçons, C1 (inversion, phrases clivées, propositions participiales, subjonctif, do d'insistance) et A2 (place et invariabilité de l'adjectif, présent simple ou continu) : le parcours est complet. Le subjonctif reste peu fourni dans Tatoeba (36 phrases traduites) : sa banque est petite. Reste la relecture des leçons ajoutées depuis la 2.25. Leurs questions de placement rédigées (`placement-written.json`) entreront dans le test avec leur leçon.

---

## Installation (Windows)

### Option A : récupérer l'installateur

La [dernière release](https://github.com/ClementJonckheere/Lexora/releases/latest) fournit l'installateur publié : lancer `Lexora_<version>_x64-setup.exe` (installation par utilisateur, sans droits administrateur) ou le `.msi`. Pour la version documentée ici, le fichier est `Lexora_2.30.0_x64-setup.exe`.

Le workflow GitHub Actions `CI & installateur Windows` lance les tests puis construit l'installateur à chaque push sur `main` ou `claude/**`, à chaque tag `v*`, pour les PR vers `main`, et sur demande depuis l'onglet *Actions* → *Run workflow*. Pour essayer une construction non publiée : **Actions → exécution réussie de la branche voulue → artefact lexora-windows**.

### Mises à jour automatiques

Dès la version 2.1.0, Lexora vérifie au démarrage (puis toutes les 6 h, ou *Paramètres → Rechercher*) si une nouvelle version est publiée et propose de l'installer en un clic.

- À chaque push, si la version (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) n'a pas encore de *Release*, la CI publie la release `v<version>` avec les installateurs signés et `latest.json`.
- Prérequis : deux secrets GitHub, **`TAURI_SIGNING_PRIVATE_KEY`** (contenu de la clé privée de signature) et **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**. La clé publique correspondante est dans `tauri.conf.json`. Sans ces secrets, l'installateur est construit mais aucune release n'est publiée.
- La clé privée ne doit jamais être commitée ; si elle est perdue, les versions déjà installées ne pourront plus se mettre à jour (il faudra réinstaller manuellement une version signée avec une nouvelle clé).

Pour publier une nouvelle version :

1. Terminer les changements et laisser les workflows **Catalogue de lecture** et **Grammaire (phrases Tatoeba)** produire leurs commits de données sur la branche à publier. Récupérer ces commits en local.
2. Si le schéma a évolué, terminer les quatre mises à jour décrites au §5 et documenter l'exécution de `supabase/schema.sql`.
3. Augmenter le même numéro dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` ; garder les fichiers de verrouillage cohérents.
4. Exécuter **`npm test`**, **`npm run typecheck`** et **`npm run build`** avant le push. Faire un petit commit en français avec la version dans le titre.
5. Pousser, puis contrôler la CI, la release `v<version>`, les installateurs, leurs signatures et `latest.json`.

**Le commit de version doit venir après les commits automatiques de données.** Une release existante n'est pas remplacée par le workflow : des données arrivées après sa construction ne seront incluses que dans une nouvelle version. Une correction de documentation seule ne demande pas de nouvelle version.

### Intégration Windows

- **Icône dans la zone de notification** : fermer la fenêtre la réduit dans la zone de notification (désactivable) ; le menu de l'icône permet d'ajouter un mot ou de lancer les révisions, l'infobulle indique le nombre de fiches à réviser.
- **Démarrage avec Windows** (option, fenêtre masquée) et **rappel quotidien** à l'heure choisie s'il reste des révisions.
- **Ajout rapide** `Alt+Maj+L` depuis n'importe quelle application, pré-rempli avec le texte copié s'il ressemble à un mot ou une expression.

### Option B : compiler soi-même

Prérequis, une seule fois :

1. [Node.js 22 LTS](https://nodejs.org) ;
2. [Rust](https://rustup.rs) (installe aussi les *Build Tools* Visual Studio si demandé : composant « Développement Desktop en C++ ») ;
3. WebView2 est déjà présent sur Windows 10/11.

```powershell
git clone https://github.com/ClementJonckheere/Lexora.git
cd Lexora
npm ci
npm run app:build
```

Installateurs générés dans `src-tauri\target\release\bundle\nsis\` (`.exe`) et `…\bundle\msi\` (`.msi`).

### Développement

```powershell
npm run app:dev     # application Tauri avec rechargement à chaud
npm run dev         # aperçu dans le navigateur (http://localhost:1420), données dans IndexedDB
npm test            # tests de la logique métier et de la synchronisation (Vitest)
npm run typecheck   # vérification TypeScript
npm run build       # vérification TypeScript et construction du frontend
cargo test --manifest-path src-tauri/Cargo.toml   # tests de la couche native
```

Le test d'intégration PostgreSQL / PostgREST est ignoré par défaut en local ; son lancement demande le serveur et les variables décrits dans [`src/core/sync/supabase.integration.test.ts`](src/core/sync/supabase.integration.test.ts). La CI dispose d'un job dédié. Un résultat local vert ne signifie pas que ce test a été exécuté.

Avant chaque push : les trois commandes `npm test`, `npm run typecheck` et `npm run build` doivent réussir. Les changements restent petits, avec des messages de commit en français. Tout outil de mesure doit conserver sa validation chiffrée comme test permanent. Textes d'interface en français, apostrophes droites et aucun tiret cadratin. Demander un accord avant de modifier le schéma Supabase, ajouter une dépendance lourde ou supprimer une fonction ; l'application conserve son principe d'absence d'IA générative.

## Compte Google et synchronisation

Voir le guide pas à pas [docs/SUPABASE.md](docs/SUPABASE.md) :

1. créer un projet Supabase ;
2. exécuter `supabase/schema.sql` ;
3. activer Google ;
4. déclarer les adresses de retour ;
5. renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : en secrets GitHub pour l'installateur, dans `.env` pour un build local.

Sans ces valeurs, l'application fonctionne sans compte et sans synchronisation.

**Relancer `supabase/schema.sql` dans l'éditeur SQL de Supabase après les évolutions suivantes**, si cela n'a pas déjà été fait. Le script complet est idempotent ; une exécution de sa version actuelle applique toutes ces évolutions.

| Version de l'application | Évolution Supabase |
|---|---|
| 2.1.0 | Colonnes `notes.suspended` et `universes.new_per_day` |
| 2.2.0 | Table `books` pour la position de lecture |
| 2.13 | Tables `word_marks`, `vocab_tests` (avec réponses brutes) et `vocab_observations` |
| 2.15 | Table `grammar_answers` pour les réponses et signalements |
| 2.16 | Fonction `grammar_reported_items` pour le retrait des exercices signalés |
| 2.20 | Tables `note_entries` (durée de saisie, titre « Archiviste de l'instant ») et `typed_answers` (réponses tapées) |
| 2.24 | Vue `placement_answers` (réponses du test de placement et des mini-tests, pour l'analyse par question) |
| 2.26 | Table `reading_sessions` (temps de lecture : XP de lecture, titre « Rat de bibliothèque ») |
| 2.27 | Table `verb_answers` (verbes irréguliers : répétition espacée, titre « Dompteur d'irréguliers ») |

Si une table facultative récente manque, ses données restent locales et les autres tables continuent à se synchroniser ; l'application signale la mise à jour nécessaire. Sans la fonction `grammar_reported_items`, le workflow Grammaire peut se terminer avec un avertissement sans lire les signalements. La version 2.20.0 ajoute les tables `note_entries` et `typed_answers`.

## Données, sauvegarde et restauration

- Base : `%APPDATA%\com.clementjonckheere.lexora\lexora.db` (chemin exact affiché dans *Paramètres*).
- **Sauvegarde automatique** : une copie par jour au démarrage, les 10 dernières sont conservées (`…\backups\`).
- **Sauvegarde JSON** (*Paramètres → Sauvegarder*) : elle couvre toutes les tables synchronisées (`SYNC_TABLES`, `src/core/repo/transfer.ts`) : univers, collections, notes, fiches, historique des révisions et de l'entraînement, livres et position de lecture, mots connus, test et observations de vocabulaire, réponses de grammaire, durées de saisie, réponses tapées, réglages synchronisés (test de placement compris). Restent hors sauvegarde les données propres à l'appareil : textes des livres téléchargés (re-téléchargeables), niveaux estimés des livres. La restauration remplace les données et se propage aux appareils synchronisés ; une copie de sécurité de la base est faite avant. Une sauvegarde d'une version antérieure, sans les tables récentes, laisse ces tables telles quelles (sauf les lignes d'un univers disparu).
- **Export** CSV (UTF-8, `;`, s'ouvre directement dans Excel) et JSON de l'univers courant. **Import** CSV et JSON dans l'univers courant, doublons ignorés.

## Sources et licences des données

- Livres : [Project Gutenberg](https://www.gutenberg.org) (œuvres du domaine public), catalogue via [Gutendex](https://gutendex.com).
- Voix naturelle : [Azure AI Speech](https://learn.microsoft.com/azure/ai-services/speech-service/) (Microsoft) ; les expressions à prononcer lui sont envoyées.
- Définitions, nature du mot et prononciations enregistrées : [Wiktionnaire](https://en.wiktionary.org) et [Wikimedia Commons](https://commons.wikimedia.org) (CC BY-SA), dont les enregistrements [Lingua Libre](https://lingualibre.org).
- Traductions : [DeepL](https://www.deepl.com) (clé personnelle facultative), [MyMemory](https://mymemory.translated.net) (Translated) ; phrases d'exemple : [Tatoeba](https://tatoeba.org), licence CC BY 2.0 FR. Les expressions à traduire sont envoyées à ces services, uniquement à la demande (bouton) ou lors d'une sélection dans un livre si la traduction automatique est activée.
- Listes de fréquence (`public/reading/freq/`) : dérivées de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave, sous-titres OpenSubtitles 2018), contenu sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ; régénérables avec `scripts/build-frequency.mjs`.

## Raccourcis clavier

| Où | Touche | Action |
|---|---|---|
| Partout | `N` / `Ctrl+N` | Ajouter une expression |
| Partout | `Ctrl+Maj+V` | Coller plusieurs expressions |
| Partout | `Ctrl+1` … `Ctrl+8` | Changer de page (`Ctrl+5` : Lecture, `Ctrl+6` : Apprendre) |
| Partout | `Alt+1` … `Alt+9` · `Ctrl+U` | Changer d'univers (langue) · Gérer les univers |
| Partout | `?` | Aide des raccourcis |
| Windows | `Alt+Maj+L` (réglable) | Ajout rapide depuis n'importe quelle application (pré-rempli avec le texte copié) |
| Partout | `Ctrl+K` | Recherche dans toutes les langues |
| Formulaire | `Entrée` / `Ctrl+Entrée` / `Échap` | Champ suivant / enregistrer / fermer |
| Formulaire | `Ctrl+T` | Traduire et trouver un exemple |
| Accueil, Réviser | `Espace` / `Entrée` | Session de 5 mots / toutes les révisions |
| Session | `Espace` | Afficher la réponse (puis la note suggérée, « Retenu » par défaut) |
| Session (réponse tapée) | `Entrée` | Vérifier la réponse saisie |
| Session | `1` `2` `3` `4` | Oublié · Difficile · Retenu · Facile |
| Session | `Z` · `E` · `P` · `S` · `Échap` | Annuler · Modifier · Prononcer · Suspendre la note · Quitter |
| Écoute | `Entrée` · `Ctrl+P` · `Ctrl+L` · `Ctrl+J` | Vérifier / suivante · Réécouter · Réécouter lentement · J'avais juste |
| Bibliothèque | `/` · `↑` `↓` · `E` · `F` · `H` · `P` · `Suppr` | Rechercher · Parcourir · Modifier · Favori · Masquer le français · Prononcer · Supprimer (annulable) |
| Bibliothèque | `X` · `Ctrl+clic` · `Maj+clic` · `Ctrl+A` · `Échap` | Sélection multiple (actions groupées : collection, tag, déplacer vers un autre univers, suspendre, supprimer) · Désélectionner |
| Lecteur | `←` `→` · `Espace` · `+` `−` · `T` · `M` · `F` · `Échap` | Page précédente / suivante · Taille du texte · Chapitres · Mots du chapitre · Plein écran · Quitter |
| Exercices de grammaire | `Entrée` · `1` / `2` · `Échap` | Vérifier / suivant · Choisir une forme · Retour à la leçon |
| Test de vocabulaire | `→` / `O` · `←` / `N` · `Z` · `Échap` | Je connais · Je ne connais pas · Revenir au mot précédent · Quitter |
| Lecteur (mot sélectionné) | `Entrée` / `A` · `P` · `Échap` | Enregistrer (ou ajouter l'exemple) · Prononcer · Annuler la sélection |

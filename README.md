# Lexora — carnet de vocabulaire multilingue & mémorisation espacée

Lexora **n'enseigne pas les langues**. Il ne propose aucun cours, aucune leçon ni aucun contenu que vous n'avez pas ajouté vous-même.
Vous apprenez par vos propres moyens (lecture, vidéos, travail, conversations). Lexora sert à :

1. **enregistrer** une expression en 5 secondes ;
2. l'**organiser** automatiquement (catégorie détectée, doublons, tags, collections) ;
3. la **retrouver** en 2 secondes (`Ctrl+K`) ;
4. la **mémoriser** par rappel actif ;
5. la **réviser au bon moment**, grâce à l'algorithme de répétition espacée **FSRS**.

Chaque langue est un **univers** (anglais, espagnol, chinois, portugais, russe, allemand…) avec sa propre bibliothèque, ses collections, ses révisions et ses statistiques.

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

Barre latérale : **sélecteur d'univers** (langue courante, nombre de fiches à réviser par langue), puis **Accueil · Bibliothèque · Réviser · Collections · Lecture · Statistiques · Paramètres**. En bas : le compte et l'état de synchronisation, **Rechercher (`Ctrl+K`)** et **+ Ajouter (`N`)**.

- **Connexion** (premier lancement) : « Continuer avec Google ». Le navigateur s'ouvre et l'application récupère la session. Elle reste ensuite connectée, y compris hors ligne.
- **Choix de la première langue** : grille de langues (anglais, espagnol, portugais, allemand, italien, russe, chinois, japonais, coréen, arabe, néerlandais, ou toute autre langue par son code ISO).

- **Accueil** : « Bonjour, prêt à réviser ? », le nombre de fiches à réviser aujourd'hui, les mots ajoutés ces 7 derniers jours, la taille de la bibliothèque. Deux gros boutons (*Commencer les révisions*, *Ajouter du vocabulaire*), puis les derniers ajouts, les mots souvent oubliés et une petite progression (maîtrise et activité sur 14 jours).
- **Bibliothèque** : tableau compact et virtualisé (des milliers de lignes restent fluides). Recherche instantanée dans la langue de l'univers **et** en français, sans tenir compte des accents (ni du « to » initial en anglais). Les filtres se combinent : maîtrise, non maîtrisées, date d'ajout, catégorie, tag, collection, favoris. Tri par date, ordre alphabétique ou maîtrise. Le bouton **Masquer le français** (`H`) permet de s'autoévaluer : on clique sur une traduction pour la révéler. Un clic sur une ligne ouvre le détail : exemples, note, état FSRS de chaque direction, historique des réponses.
- **Réviser** : sessions de 5 / 10 / 20 mots ou toutes les révisions du jour. On peut choisir la direction (les deux, français → langue ou langue → français) et limiter à une collection. Trois modes d'**entraînement libre** : mots difficiles, phrases à trous et aléatoire.
- **Collections** : listes personnalisées (Business English, Phrasal Verbs…). Une note peut appartenir à plusieurs collections. Chaque collection se révise et s'entraîne séparément.
- **Lecture** : des livres libres de droits dans la langue de l'univers (catalogue de [Project Gutenberg](https://www.gutenberg.org) via l'API [Gutendex](https://gutendex.com), sans clé). Gutendex étant parfois lent, la dernière liste chargée s'affiche immédiatement puis s'actualise ; au-delà de 12 s sans réponse, le catalogue de gutenberg.org (flux OPDS) prend le relais.
  - *Découvrir* : couvertures, recherche par titre ou auteur, **niveau estimé** de chaque livre (A1 → C2) et filtre **Niveau maximum** pour n'afficher que les livres accessibles. Avec un filtre, la suite du catalogue est chargée automatiquement tant qu'il y a trop peu de livres adaptés.
  - *Mes livres* : couverture, progression ; la position de lecture est synchronisée entre appareils (le texte, lui, est téléchargé sur chaque appareil).
  - **Lecteur plein écran** en double page (une page si la fenêtre est étroite) : `←` `→`, `Espace`, molette ; `+` / `−` pour la taille du texte ; papier ivoire, blanc ou nuit ; police sans ou serif ; `T` table des chapitres ; `F` plein écran ; `Échap` pour quitter.
  - **Enregistrer un mot en lisant** : double-clic sur un mot (ou sélection d'une expression), puis `Entrée` dans la bulle. La fiche s'ouvre pré-remplie : l'expression (ponctuation et majuscule de début de phrase retirées), **la phrase du livre comme exemple** et la source (« Lu dans … ») ; il ne reste qu'à taper la traduction. Si l'expression est déjà dans vos fiches, la bulle affiche sa traduction et propose d'ajouter la phrase comme nouvel exemple. `P` la prononce. Aucun service externe n'est utilisé.
  - *Niveau estimé, sans IA* : sur un extrait du texte, on mesure combien de mots courants (liste de fréquence de la langue) il faut connaître pour comprendre 90 % du texte, et la longueur des phrases ; le chinois et le japonais sont mesurés par caractères. Calibré sur des livres de référence (Alice ≈ B1, Treasure Island ≈ B2, Pride and Prejudice ≈ B2/C1, Moby-Dick ≈ C2). C'est une indication, pas une certification ; le niveau est recalculé sur le texte entier au téléchargement.
- **Statistiques** : chiffres réels uniquement (voir §6).
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
| Prononciation | Synthèse vocale du système (Web Speech API) | Voix Windows locales, hors ligne, aucune dépendance. |
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
    platform/           compte Google, fichiers, synthèse vocale, raccourci global
  app/                  état applicatif (store), planification de la synchro, import/export
  ui/                   composants React (components/) et pages (features/)
src-tauri/              couche native Rust : connexion SQLite, sauvegardes, fichiers, retour OAuth
supabase/schema.sql     tables PostgreSQL, déclencheurs, règles RLS (à exécuter dans Supabase)
```

Le Rust reste volontairement mince : il expose une connexion SQLite unique (`db_select`, `db_execute`), la lecture et l'écriture des fichiers choisis dans une boîte de dialogue, les sauvegardes automatiques, et un mini-serveur `127.0.0.1` qui reçoit le retour de la connexion Google. Les transactions (`BEGIN IMMEDIATE … COMMIT`) sont pilotées depuis TypeScript sur cette connexion unique, et toutes les requêtes passent par un verrou asynchrone : une transaction n'est jamais entrelacée avec une autre requête.

Le même code SQL tourne dans les trois environnements. Dans l'application, c'est rusqlite. Avec `npm run dev`, un aperçu navigateur utilise sql.js (WebAssembly), persisté dans IndexedDB. Les tests utilisent sql.js en mémoire.

## 5. Modèle de données

Schéma v2, identique en local (SQLite) et dans Supabase (PostgreSQL, avec en plus `user_id` et `server_updated_at`) :

```
universes      id, name, language (code ISO : en, es, zh…), position, created_at
notes          id, universe_id, expression, translation, pronunciation, expression_key (doublons),
               comment, category, category_auto, is_favorite,
               examples[], tags[], collection_ids[] (JSON), created_at
collections    id, universe_id, name, description, created_at
cards          id, note_id, direction ('fr_en' = français → langue | 'en_fr' = langue → français),
               state, due, stability, difficulty, elapsed_days, scheduled_days,
               learning_steps, reps, lapses, last_review                 (= carte FSRS)
review_logs    id, card_id, rating 1-4, état FSRS AVANT la réponse, reviewed_at, duration_ms
practice_logs  id, note_id, mode ('cloze'|'random'|'difficult'), rating, created_at
settings       key, value (réglages partagés entre appareils)
device_settings, sync_state      (local uniquement : voix, raccourci ; compte lié, curseurs)

+ sur chaque table synchronisée : updated_at (ms), deleted (suppression douce), dirty (local : à envoyer)
```

- Identifiants **UUID** : des lignes créées hors ligne sur deux appareils ne peuvent pas entrer en collision.
- Chaque note crée **deux fiches**, une par direction : la maîtrise est suivie **séparément**.
- Les **suppressions sont douces** (`deleted = 1`) pour se propager aux autres appareils.
- Les **migrations** sont versionnées (`PRAGMA user_version`, `src/core/db/migrations.ts`). Chacune s'applique dans sa propre transaction. La v2 a converti la base v1 sans perte : notes, exemples, tags, collections, fiches et historique sont rangés dans un univers « Anglais ».

### Synchronisation

Le moteur (`src/core/sync/engine.ts`) fonctionne **hors ligne d'abord** :

1. toute écriture locale marque la ligne `dirty` et met à jour `updated_at` ;
2. un cycle **reçoit** d'abord, table par table, ce qui a changé sur le serveur depuis le dernier curseur `server_updated_at`. Une ligne reçue n'écrase la ligne locale que si elle est plus récente ;
3. puis il **envoie** les lignes `dirty`. Côté serveur, un déclencheur PostgreSQL refuse qu'une version plus ancienne remplace une plus récente ;
4. **RLS** : chaque compte ne lit et n'écrit que ses propres lignes (`user_id = auth.uid()`).

La synchronisation se déclenche quelques secondes après chaque modification, toutes les 2 minutes, au retour du réseau, quand la fenêtre reprend le focus, ou via le bouton *Synchroniser*. L'historique des révisions est en ajout seul : les révisions faites sur plusieurs appareils s'additionnent.

## 6. Logique de mémorisation

**FSRS** modélise chaque fiche par sa *stabilité* (nombre de jours au bout duquel la probabilité de rappel tombe à 90 %) et sa *difficulté*. Après chaque réponse, il calcule la prochaine date pour viser la **rétention souhaitée** (90 % par défaut, réglable).

- **Nouvelle expression** : étapes courtes (1 min, 10 min) dans la session, puis intervalles en jours.
- **Oubliée** (`1`) : la fiche passe en réapprentissage, revient dans la session quelques cartes plus loin, sa stabilité chute et l'oubli est compté.
- **Retenue plusieurs fois** : les intervalles s'allongent progressivement (jours → semaines → mois).
- **Ordre d'une session** : fiches en cours d'apprentissage, puis révisions dues (les plus menacées d'oubli d'abord, selon leur probabilité de rappel actuelle), puis nouveaux mots répartis entre les révisions.
- **Plafond de nouveaux mots par jour** (10 par défaut). Un mot est « introduit » quand sa fiche FR→EN est vue pour la première fois. La fiche EN→FR n'est proposée qu'à partir du lendemain, et deux fiches d'une même note ne se suivent jamais.
- **FR→EN est prioritaire** : c'est la direction qui sert à parler spontanément. On peut aussi réviser une seule direction.
- **Consulter n'est pas réviser** : ouvrir une note, la chercher ou masquer/afficher sa traduction dans la bibliothèque ne touche jamais à la planification. Seule une réponse dans une session planifiée met FSRS à jour.
- L'**entraînement libre** (aléatoire, mots difficiles, phrases à trous) est enregistré dans l'historique (`practice_logs`) mais **ne modifie jamais** les dates de révision.
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

---

## Installation (Windows)

### Option A — récupérer l'installateur

Le workflow GitHub Actions `CI & installateur Windows` construit automatiquement l'installateur à chaque push sur `main`, à chaque tag `v*` et sur demande depuis l'onglet *Actions* → *Run workflow* :

1. GitHub → **Actions** → dernière exécution réussie → artefact **lexora-windows** ;
2. lancer `Lexora_2.1.0_x64-setup.exe` (installation par utilisateur, sans droits administrateur) ou le `.msi`.

### Mises à jour automatiques

Dès la version 2.1.0, Lexora vérifie au démarrage (puis toutes les 6 h, ou *Paramètres → Rechercher*) si une nouvelle version est publiée et propose de l'installer en un clic.

- À chaque push, si la version (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) n'a pas encore de *Release*, la CI publie la release `v<version>` avec les installateurs signés et `latest.json`.
- Prérequis : deux secrets GitHub, **`TAURI_SIGNING_PRIVATE_KEY`** (contenu de la clé privée de signature) et **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**. La clé publique correspondante est dans `tauri.conf.json`. Sans ces secrets, l'installateur est construit mais aucune release n'est publiée.
- La clé privée ne doit jamais être commitée ; si elle est perdue, les versions déjà installées ne pourront plus se mettre à jour (il faudra réinstaller manuellement une version signée avec une nouvelle clé).
- Pour publier une nouvelle version : augmenter le numéro dans les trois fichiers et pousser.

### Intégration Windows

- **Icône dans la zone de notification** : fermer la fenêtre la réduit dans la zone de notification (désactivable) ; le menu de l'icône permet d'ajouter un mot ou de lancer les révisions, l'infobulle indique le nombre de fiches à réviser.
- **Démarrage avec Windows** (option, fenêtre masquée) et **rappel quotidien** à l'heure choisie s'il reste des révisions.
- **Ajout rapide** `Alt+Maj+L` depuis n'importe quelle application, pré-rempli avec le texte copié s'il ressemble à un mot ou une expression.

### Option B — compiler soi-même

Prérequis, une seule fois :

1. [Node.js 22 LTS](https://nodejs.org) ;
2. [Rust](https://rustup.rs) (installe aussi les *Build Tools* Visual Studio si demandé : composant « Développement Desktop en C++ ») ;
3. WebView2 est déjà présent sur Windows 10/11.

```powershell
git clone https://github.com/ClementJonckheere/Lexora.git
cd Lexora
npm install
npm run app:build
```

Installateurs générés dans `src-tauri\target\release\bundle\nsis\` (`.exe`) et `…\bundle\msi\` (`.msi`).

### Développement

```powershell
npm run app:dev     # application Tauri avec rechargement à chaud
npm run dev         # aperçu dans le navigateur (http://localhost:1420), données dans IndexedDB
npm test            # tests de la logique métier et de la synchronisation (Vitest)
npm run typecheck   # vérification TypeScript
cargo test --manifest-path src-tauri/Cargo.toml   # tests de la couche native
```

## Compte Google et synchronisation

Voir le guide pas à pas [docs/SUPABASE.md](docs/SUPABASE.md) :

1. créer un projet Supabase ;
2. exécuter `supabase/schema.sql` ;
3. activer Google ;
4. déclarer les adresses de retour ;
5. renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : en secrets GitHub pour l'installateur, dans `.env` pour un build local.

Sans ces valeurs, l'application fonctionne sans compte et sans synchronisation.

**Mise à jour 2.2.0** : relancer `supabase/schema.sql` (nouvelle table `books` pour la position de lecture). **Mise à jour 2.1.0** : relancer `supabase/schema.sql` dans l'éditeur SQL de Supabase (colonnes `notes.suspended` et `universes.new_per_day`). Le script est idempotent. Sans cela, la synchronisation affiche « base Supabase à mettre à jour ».

## Données, sauvegarde et restauration

- Base : `%APPDATA%\com.clementjonckheere.lexora\lexora.db` (chemin exact affiché dans *Paramètres*).
- **Sauvegarde automatique** : une copie par jour au démarrage, les 10 dernières sont conservées (`…\backups\`).
- **Sauvegarde complète** (*Paramètres → Sauvegarder*) : un fichier JSON avec tous les univers, les notes, les fiches FSRS, l'historique et les réglages. Il se **restaure** à l'identique, et la restauration se propage aux appareils synchronisés. Une copie de sécurité de la base est faite avant chaque restauration.
- **Export** CSV (UTF-8, `;`, s'ouvre directement dans Excel) et JSON de l'univers courant. **Import** CSV et JSON dans l'univers courant, doublons ignorés.

## Sources et licences des données

- Livres : [Project Gutenberg](https://www.gutenberg.org) (œuvres du domaine public), catalogue via [Gutendex](https://gutendex.com).
- Listes de fréquence (`public/reading/freq/`) : dérivées de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave, sous-titres OpenSubtitles 2018), contenu sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ; régénérables avec `scripts/build-frequency.mjs`.

## Raccourcis clavier

| Où | Touche | Action |
|---|---|---|
| Partout | `N` / `Ctrl+N` | Ajouter une expression |
| Partout | `Ctrl+Maj+V` | Coller plusieurs expressions |
| Partout | `Ctrl+1` … `Ctrl+7` | Changer de page (`Ctrl+5` : Lecture) |
| Partout | `Alt+1` … `Alt+9` · `Ctrl+U` | Changer d'univers (langue) · Gérer les univers |
| Partout | `?` | Aide des raccourcis |
| Windows | `Alt+Maj+L` (réglable) | Ajout rapide depuis n'importe quelle application (pré-rempli avec le texte copié) |
| Partout | `Ctrl+K` | Recherche dans toutes les langues |
| Formulaire | `Entrée` / `Ctrl+Entrée` / `Échap` | Champ suivant / enregistrer / fermer |
| Accueil, Réviser | `Espace` / `Entrée` | Session de 5 mots / toutes les révisions |
| Session | `Espace` | Afficher la réponse (puis la note suggérée, « Retenu » par défaut) |
| Session (réponse tapée) | `Entrée` | Vérifier la réponse saisie |
| Session | `1` `2` `3` `4` | Oublié · Difficile · Retenu · Facile |
| Session | `Z` · `E` · `P` · `S` · `Échap` | Annuler · Modifier · Prononcer · Suspendre la note · Quitter |
| Bibliothèque | `/` · `↑` `↓` · `E` · `F` · `H` · `P` · `Suppr` | Rechercher · Parcourir · Modifier · Favori · Masquer le français · Prononcer · Supprimer (annulable) |
| Bibliothèque | `X` · `Ctrl+clic` · `Maj+clic` · `Ctrl+A` · `Échap` | Sélection multiple (actions groupées : collection, tag, déplacer vers un autre univers, suspendre, supprimer) · Désélectionner |
| Lecteur | `←` `→` · `Espace` · `+` `−` · `T` · `F` · `Échap` | Page précédente / suivante · Taille du texte · Chapitres · Plein écran · Quitter |
| Lecteur (mot sélectionné) | `Entrée` / `A` · `P` · `Échap` | Enregistrer (ou ajouter l'exemple) · Prononcer · Annuler la sélection |

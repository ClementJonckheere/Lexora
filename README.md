# Lexora — carnet de vocabulaire anglais & mémorisation espacée

Lexora **n'enseigne pas l'anglais**. Il ne propose aucun cours, aucune leçon ni aucun contenu que vous n'avez pas ajouté vous-même.
Vous apprenez par vos propres moyens (lecture, vidéos, travail, conversations). Lexora sert à :

1. **enregistrer** une expression en 5 secondes ;
2. l'**organiser** automatiquement (catégorie détectée, doublons, tags, collections) ;
3. la **retrouver** en 2 secondes (`Ctrl+K`) ;
4. la **mémoriser** par rappel actif ;
5. la **réviser au bon moment**, grâce à l'algorithme de répétition espacée **FSRS**.

Application de bureau Windows, **100 % locale et hors ligne** : aucun compte, aucun abonnement, aucun serveur.

---

## 1. Concept

Le quotidien type tient en deux gestes :

| Moment | Geste | Coût |
|---|---|---|
| Je croise une expression | `N` (ou `Alt+Maj+L` depuis n'importe quelle application) → anglais `Entrée` français `Entrée` exemple `Ctrl+Entrée` | ~5 s |
| J'ai 2 minutes | J'ouvre Lexora → `Espace` (5 mots) ou `Entrée` (toutes les révisions du jour) → `Espace` pour dévoiler, `1`–`4` pour noter | quelques secondes par mot |

Tout le reste (planification, ordre, rythme, catégorie) est automatique.

## 2. Pages

Barre latérale : **Accueil · Bibliothèque · Réviser · Collections · Statistiques · Paramètres**, avec en permanence **Rechercher (`Ctrl+K`)** et **+ Ajouter (`N`)**.

- **Accueil** : « Bonjour, prêt à réviser ? », le nombre de fiches à réviser aujourd'hui, les mots ajoutés ces 7 derniers jours, la taille de la bibliothèque. Deux gros boutons (*Commencer les révisions*, *Ajouter du vocabulaire*), puis les derniers ajouts, les mots souvent oubliés et une petite progression (maîtrise et activité sur 14 jours).
- **Bibliothèque** : tableau compact et virtualisé (des milliers de lignes restent fluides). Recherche instantanée en anglais **et** en français, sans tenir compte des accents ni du « to » initial. Les filtres se combinent : maîtrise, non maîtrisées, date d'ajout, catégorie, tag, collection, favoris. Tri par date, ordre alphabétique ou maîtrise. Le bouton **Masquer le français** (`H`) permet de s'autoévaluer : on clique sur une traduction pour la révéler. Un clic sur une ligne ouvre le détail : exemples, note, état FSRS de chaque direction, historique des réponses.
- **Réviser** : sessions de 5 / 10 / 20 mots ou toutes les révisions du jour. On peut choisir la direction (les deux, FR→EN ou EN→FR) et limiter à une collection. Trois modes d'**entraînement libre** : mots difficiles, phrases à trous et aléatoire.
- **Collections** : listes personnalisées (Business English, Phrasal Verbs…). Une note peut appartenir à plusieurs collections. Chaque collection se révise et s'entraîne séparément.
- **Statistiques** : chiffres réels uniquement (voir §6).
- **Paramètres** : réglages de mémorisation, voix, raccourci global, import/export, sauvegardes.

## 3. Parcours utilisateurs

**Ajouter** : `N` ouvre le formulaire, curseur dans « Expression ». `Entrée` passe au champ suivant et `Ctrl+Entrée` enregistre. Seuls l'anglais et le français sont obligatoires. L'exemple est facultatif et on peut en ajouter plusieurs. Les tags, collections, catégorie et note libre sont repliés par défaut. Les **doublons** sont signalés pendant la frappe (« tackle an issue » = « To tackle an issue. »), avec un lien pour ouvrir la note existante. L'option **Ajout en série** garde le formulaire ouvert pour enchaîner plusieurs expressions.

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
| Répétition espacée | **FSRS** via `ts-fsrs` (bibliothèque de référence de l'Open Spaced Repetition) | Algorithme moderne, plus précis que SM-2 (Anki historique). |
| Prononciation | Synthèse vocale du système (Web Speech API) | Voix Windows locales, hors ligne, aucune dépendance. |
| Tests | Vitest (logique métier sur une vraie base SQLite en mémoire via sql.js), `cargo test` (couche native) | |

**Séparation des responsabilités** :

```
src/
  core/                 ← logique métier pure, sans React (testée)
    db/                 abstraction SQLite, migrations, pilotes (Tauri / navigateur / tests)
    domain/             types, validation, normalisation, doublons, catégorisation,
                        phrases à trous, CSV, recherche & filtres, dates, réglages
    srs/                FSRS (scheduler), file de révision, session, entraînement libre
    repo/               accès aux données : notes, collections, révisions, stats, import/export
    platform/           fichiers, synthèse vocale, raccourci global
  app/                  état applicatif (store), actions d'import/export
  ui/                   composants React (components/) et pages (features/)
src-tauri/              couche native Rust : connexion SQLite, sauvegardes, fichiers
```

Le Rust reste volontairement mince : il expose une connexion SQLite unique (`db_select`, `db_execute`), la lecture et l'écriture des fichiers choisis dans une boîte de dialogue, la sauvegarde et la restauration. Les transactions (`BEGIN IMMEDIATE … COMMIT`) sont pilotées depuis TypeScript sur cette connexion unique, et toutes les requêtes passent par un verrou asynchrone : une transaction n'est jamais entrelacée avec une autre requête.

Le même code SQL tourne dans les trois environnements. Dans l'application, c'est rusqlite. Avec `npm run dev`, un aperçu navigateur utilise sql.js (WebAssembly), persisté dans IndexedDB. Les tests utilisent sql.js en mémoire.

## 5. Modèle de données

```
notes            id, expression, translation, expression_key (clé normalisée → doublons),
                 comment, category, category_auto, is_favorite, created_at, updated_at
examples         id, note_id → notes, sentence, position            (plusieurs exemples par note)
tags             id, name (unique, insensible à la casse)
note_tags        note_id → notes, tag_id → tags
collections      id, name (unique), description, created_at
collection_notes collection_id → collections, note_id → notes, added_at   (n-n)
cards            id, note_id → notes, direction ('fr_en' | 'en_fr'),
                 state, due, stability, difficulty, elapsed_days, scheduled_days,
                 learning_steps, reps, lapses, last_review           (= carte FSRS)
review_logs      id, card_id → cards, rating 1-4, état FSRS AVANT la réponse,
                 reviewed_at, duration_ms                            (historique complet)
practice_logs    id, note_id → notes, mode ('cloze'|'random'|'difficult'), rating, created_at
settings         key, value (JSON)
```

- Chaque note crée **deux fiches**, une par direction : la maîtrise est suivie **séparément**.
- Les dates sont stockées en millisecondes. Les suppressions sont en cascade : supprimer une note supprime ses fiches et son historique.
- Les **migrations** sont versionnées (`PRAGMA user_version`, `src/core/db/migrations.ts`). Chacune s'applique dans sa propre transaction. Une migration publiée n'est jamais modifiée : toute évolution passe par une nouvelle entrée.

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
2. lancer `Lexora_2.0.0_x64-setup.exe` (installation par utilisateur, sans droits administrateur) ou le `.msi`.

Un tag `v2.0.0` crée en plus un brouillon de *Release* contenant les installateurs.

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
npm test            # tests de la logique métier (Vitest)
npm run typecheck   # vérification TypeScript
cargo test --manifest-path src-tauri/Cargo.toml   # tests de la couche native
```

## Données, sauvegarde et restauration

- Base : `%APPDATA%\com.clementjonckheere.lexora\lexora.db` (chemin exact affiché dans *Paramètres*).
- **Sauvegarde automatique** : une copie par jour au démarrage, les 10 dernières sont conservées (`…\backups\`).
- **Sauvegarde complète** (*Paramètres → Sauvegarder*) : un fichier JSON avec les notes, les fiches FSRS, l'historique et les réglages. Il se **restaure** à l'identique, tout comme un fichier `.db` des sauvegardes automatiques. Une copie de sécurité est faite avant chaque restauration.
- **Export** CSV (UTF-8, `;`, s'ouvre directement dans Excel) et JSON. **Import** CSV et JSON, doublons ignorés.

## Raccourcis clavier

| Où | Touche | Action |
|---|---|---|
| Partout | `N` / `Ctrl+N` | Ajouter une expression |
| Partout | `Ctrl+K` | Recherche instantanée |
| Partout | `Ctrl+Maj+V` | Coller plusieurs expressions |
| Partout | `Ctrl+1` … `Ctrl+6` | Changer de page |
| Partout | `?` | Aide des raccourcis |
| Windows | `Alt+Maj+L` (réglable) | Ajout rapide depuis n'importe quelle application |
| Formulaire | `Entrée` / `Ctrl+Entrée` / `Échap` | Champ suivant / enregistrer / fermer |
| Accueil, Réviser | `Espace` / `Entrée` | Session de 5 mots / toutes les révisions |
| Session | `Espace` | Afficher la réponse (puis « Retenu ») |
| Session | `1` `2` `3` `4` | Oublié · Difficile · Retenu · Facile |
| Session | `Z` · `E` · `P` · `Échap` | Annuler · Modifier · Prononcer · Quitter |
| Bibliothèque | `/` · `↑` `↓` · `E` · `F` · `H` · `P` · `Suppr` | Rechercher · Parcourir · Modifier · Favori · Masquer le français · Prononcer · Supprimer |

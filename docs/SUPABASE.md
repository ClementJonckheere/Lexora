# Configurer le compte Google et la synchronisation (Supabase)

Comptez 15 minutes, une seule fois. À la fin, vous aurez deux valeurs à donner à l'application :
l'**URL du projet** et la **clé publique** (`anon` / `publishable`).

> La clé publique est faite pour être embarquée dans l'application : la sécurité repose sur les
> règles RLS du script SQL (chaque compte ne voit que ses propres lignes).
> Ne mettez **jamais** la clé `service_role` / `secret` dans l'application.

---

## 1. Créer le projet Supabase

1. <https://supabase.com> → **New project**.
2. Nom : `lexora`, région : *West EU (Paris)* ou *Ireland*, mot de passe de base au choix (à conserver).
3. Attendre la fin de la création (~2 min).

## 2. Créer les tables

1. Menu **SQL Editor** → **New query**.
2. Coller tout le contenu de [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. Vérifier dans **Table Editor** : `universes`, `notes`, `cards`, `collections`, `review_logs`, `practice_logs`, `settings`, toutes marquées *RLS enabled*.

Le script peut être relancé sans risque. **À relancer après la mise à jour vers Lexora 2.1.0** (nouvelles colonnes `notes.suspended` et `universes.new_per_day`).

## 3. Créer l'identifiant Google (Google Cloud)

1. <https://console.cloud.google.com> → créer un projet `Lexora` (ou en choisir un).
2. **APIs et services → Écran de consentement OAuth** (*Google Auth Platform*) :
   type **Externe**, nom de l'application `Lexora`, votre e-mail en contact.
   Tant que l'application est en mode *Test*, ajoutez votre adresse Gmail dans **Utilisateurs test**
   (ou cliquez **Publier l'application** pour l'ouvrir à tout compte Google).
3. **Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web** ;
   - **Origines JavaScript autorisées** : laisser **vide** (cette rubrique refuse les adresses avec un chemin :
     « Origine non valide : les URI ne doivent pas contenir de chemin d'accès ») ;
   - **URI de redirection autorisés** (la rubrique du dessous) → **Ajouter un URI** :
     `https://<VOTRE-PROJET>.supabase.co/auth/v1/callback`, où `<VOTRE-PROJET>` est l'identifiant de votre
     projet (ex. `https://abcdefghijklmnop.supabase.co/auth/v1/callback`). Le plus simple : copier la
     *Callback URL* affichée dans Supabase à l'étape 4.
4. Copier l'**ID client** et le **Code secret du client**.

## 4. Activer Google dans Supabase

1. Supabase → **Authentication → Sign In / Providers → Google** → activer.
2. Coller l'**ID client** et le **secret** de l'étape 3 → **Save**.
   (L'adresse *Callback URL* affichée ici est celle à mettre dans Google, étape 3.)

## 5. Autoriser le retour vers l'application

Supabase → **Authentication → URL Configuration** → **Redirect URLs** → ajouter :

```
http://127.0.0.1:47821/**
http://127.0.0.1:47822/**
http://127.0.0.1:47823/**
http://localhost:1420/**
```

Les trois premières servent à l'application Windows : après la connexion dans le navigateur, Google
revient sur un mini-serveur local ouvert par Lexora le temps de la connexion. La dernière sert à l'aperçu
`npm run dev`.

## 6. Récupérer l'URL et la clé publique

Supabase → **Project Settings → API** (ou **Data API** / **API Keys**) :

- **Project URL** : `https://xxxxxxxxxxxx.supabase.co`
- **anon public** (ou **publishable**) key.

## 7. Donner ces valeurs à l'application

### Installateur construit par GitHub Actions (recommandé)

GitHub → dépôt **Lexora** → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | l'URL du projet |
| `VITE_SUPABASE_ANON_KEY` | la clé publique |

Relancer le workflow (**Actions → CI & installateur Windows → Run workflow**, ou un nouveau push) puis
télécharger l'artefact `lexora-windows` comme d'habitude.

### Compilation locale / développement

Copier `.env.example` en `.env` à la racine et remplir les deux valeurs, puis `npm run app:build`
(ou `npm run dev`).

---

## Fonctionnement

- **Hors ligne d'abord** : chaque appareil garde sa base SQLite locale. Tout fonctionne sans réseau ;
  les modifications partent dès que la connexion revient (quelques secondes après chaque modification,
  toutes les 2 minutes, au retour du réseau, et via le bouton *Synchroniser*).
- **Conflits** : ligne par ligne, la modification la plus récente l'emporte. L'historique des révisions
  s'additionne : une révision faite sur le téléphone et une autre sur le PC sont toutes deux conservées.
- **Suppressions** : propagées à tous les appareils.
- **Réglages** : les réglages de mémorisation sont partagés ; la voix, la vitesse de lecture et le
  raccourci global restent propres à chaque appareil.
- **Premier lancement connecté** : les données déjà présentes sur l'ordinateur sont rattachées au compte
  et envoyées. Si un autre compte se connecte sur le même ordinateur, Lexora demande confirmation avant de
  remplacer les données locales (celles de l'autre compte restent dans son espace en ligne).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| La page Google affiche `redirect_uri_mismatch` | L'URI de l'étape 3 ne correspond pas exactement à la *Callback URL* de Supabase. |
| Après Google, le navigateur ouvre le *Site URL* au lieu de « Connexion réussie » | Les adresses `http://127.0.0.1:4782x/**` manquent dans **Redirect URLs** (étape 5). |
| `Access blocked: … has not completed the Google verification process` | Ajoutez votre adresse dans **Utilisateurs test** ou publiez l'application (étape 3). |
| « … base Supabase à mettre à jour : relancez supabase/schema.sql » | Une nouvelle version de Lexora ajoute des colonnes : relancez le script (étape 2). |
| « Synchronisation en échec : … permission denied » | Le script `schema.sql` n'a pas été exécuté (ou pas entièrement). |
| L'application démarre sans écran de connexion | Les secrets `VITE_SUPABASE_*` n'étaient pas définis au moment du build. |

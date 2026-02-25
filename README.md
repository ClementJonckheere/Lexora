# Lexora — Guide de déploiement complet

## Architecture

```
GitHub Pages                    Render.com                  Supabase
(frontend gratuit)    →    (backend FastAPI gratuit)   →   (PostgreSQL gratuit)
clementjonckheere          lexora-backend                  db.xxxxx.supabase.co
.github.io/Lexora          .onrender.com/api
```

---

## ÉTAPE 1 — Créer la base de données sur Supabase

1. Va sur **supabase.com** → **Start for free**
2. Connexion avec GitHub
3. **New project** → Name: `lexora`, Region: `West EU (Ireland)`, note le mot de passe
4. Attends ~2 minutes
5. **Settings → Database → Connection string → URI** → copie l'URL
6. Format : `postgresql://postgres:[MDP]@db.xxxx.supabase.co:5432/postgres`

---

## ÉTAPE 2 — Déployer le backend sur Render

1. Va sur **render.com** → connexion GitHub
2. **New → Web Service** → sélectionne le repo `Lexora`
3. Configure :
   - Root Directory : `backend`
   - Runtime : `Python 3`
   - Build Command : `pip install -r requirements.txt`
   - Start Command : `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Plan : `Free`
4. **Environment Variables** :

| Key | Value |
|-----|-------|
| `DATABASE_URL` | URL Supabase (étape 1) |
| `ANTHROPIC_API_KEY` | `sk-ant-xxxxx` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ALLOWED_ORIGINS` | `https://clementjonckheere.github.io` |
| `DEFAULT_DAILY_QUOTA` | `50` |

5. Clique **Create Web Service** → URL : `https://lexora-backend.onrender.com`

---

## ÉTAPE 3 — Initialiser la base de données

Dans Render → ton service → onglet **Shell** :

```bash
python -c "from app.database import engine; from app.models import Base; Base.metadata.create_all(engine)"
python create_admin.py
```

---

## ÉTAPE 4 — Connecter le frontend

Dans `index.html`, ligne `API_BASE` :
```javascript
const API_BASE = 'https://lexora-backend.onrender.com/api';
```

---

## ÉTAPE 5 — Publier sur GitHub

```bash
git add .
git commit -m "deploy: Render + Supabase"
git push origin main
```

GitHub → **Settings → Pages → Source : main / root** → Save

App live sur : **https://clementjonckheere.github.io/Lexora**

---

## ÉTAPE 6 — Éviter le sleep de Render (optionnel)

Render endort l'app après 15 min d'inactivité (premier appel lent).
Inscris-toi sur **uptimerobot.com** (gratuit) et crée un monitor HTTP sur :
`https://lexora-backend.onrender.com/api/health` toutes les 5 minutes.

---

## URLs finales

| Service | URL |
|---------|-----|
| Frontend | `https://clementjonckheere.github.io/Lexora` |
| Backend API | `https://lexora-backend.onrender.com/api` |
| Doc API (Swagger) | `https://lexora-backend.onrender.com/api/docs` |

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import engine
from .models import Base
from .routers import auth, generate, admin

settings = get_settings()

# Créer les tables automatiquement au démarrage
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Lexora API",
    description="Backend proxy sécurisé pour Lexora",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(generate.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/init-db")
def init_db():
    """Route temporaire pour initialiser la DB et créer le premier admin."""
    try:
        Base.metadata.create_all(bind=engine)
        return {"status": "Tables créées avec succès"}
    except Exception as e:
        return {"error": str(e)}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "Erreur interne du serveur"},
    )

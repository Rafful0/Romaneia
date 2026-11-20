from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.db import engine
from app.errors import registrar_handlers
from app.routers import auth, clientes, geral, pedidos, produtos, romaneios, rotas

app = FastAPI(title="Romaneia API", version="0.1.0")
registrar_handlers(app)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type"])

api = APIRouter(prefix="/api")
for r in (auth, clientes, produtos, pedidos, rotas, romaneios, geral):
    api.include_router(r.router)


@api.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    return {"status": "ok"}


app.include_router(api)

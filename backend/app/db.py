from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


def set_tenant(conn: Connection, empresa_id: str, usuario_id: str | None = None) -> None:
    # set_config(..., true) = vale só nesta transação; nunca vaza para outra requisição do pool.
    conn.execute(
        text("select set_config('app.empresa_id', :e, true), set_config('app.usuario_id', :u, true)"),
        {"e": str(empresa_id), "u": str(usuario_id or "")},
    )

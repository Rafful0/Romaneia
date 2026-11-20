from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.config import settings

_ph = PasswordHasher()
# Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails existem).
_HASH_FALSO = _ph.hash("senha-inexistente")


def hash_senha(senha: str) -> str:
    return _ph.hash(senha)


def verificar_senha(senha: str, hash_: str | None) -> bool:
    try:
        return _ph.verify(hash_ or _HASH_FALSO, senha) and hash_ is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def criar_token(usuario_id: str, empresa_id: str, papel: str, expira_min: int | None = None) -> str:
    agora = datetime.now(timezone.utc)
    exp = agora + timedelta(minutes=settings.jwt_expira_min if expira_min is None else expira_min)
    return jwt.encode({"sub": str(usuario_id), "emp": str(empresa_id), "papel": papel,
                       "iat": agora, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def ler_token(token: str) -> dict:
    """Levanta jwt.ExpiredSignatureError / jwt.InvalidTokenError."""
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub", "emp"]})

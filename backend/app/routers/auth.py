import base64
import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.config import settings
from app.db import engine, set_tenant
from app.deps import COOKIE, Ctx, ctx
from app.domain import normalizar_email, normalizar_telefone
from app.errors import AppError
from app.schemas import CadastroConfirmarIn, CadastroGoogleIn, CadastroIniciarIn, LoginIn
from app.security import criar_token, hash_senha, verificar_senha

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("romaneia.cadastro")

CODIGO_VALIDADE = timedelta(minutes=10)
MAX_TENTATIVAS = 5
COOKIE_OAUTH = "romaneia_oauth"
COOKIE_CAD_GOOGLE = "romaneia_cadastro_google"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_ISS = {"https://accounts.google.com", "accounts.google.com"}


# ---------- sessão ----------
def _buscar(conn: Connection, email=None, telefone=None, google_sub=None) -> list[dict]:
    return [dict(r) for r in conn.execute(text("select * from auth_buscar_usuario(:e, :t, :g)"),
                                          {"e": email, "t": telefone, "g": google_sub}).mappings().all()]


def _abrir_sessao(conn: Connection, resp: Response, usuario_id, empresa_id, acao: str, detalhes: str = "{}") -> dict:
    """Registra a auditoria na empresa do usuário, grava o cookie e devolve os dados de /me."""
    set_tenant(conn, empresa_id, usuario_id)
    conn.execute(text("insert into auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, detalhes) "
                      "values (:e, :u, :a, 'usuario', :u, cast(:d as jsonb))"),
                 {"e": empresa_id, "u": usuario_id, "a": acao, "d": detalhes})
    u = conn.execute(text("select u.nome, u.papel, e.nome empresa from usuarios u join empresas e on e.id = u.empresa_id "
                          "where u.id = :u"), {"u": usuario_id}).mappings().one()
    resp.set_cookie(COOKIE, criar_token(usuario_id, empresa_id, u["papel"]), httponly=True,
                    secure=settings.cookie_secure, samesite="lax", max_age=settings.jwt_expira_min * 60, path="/")
    return {"id": str(usuario_id), "nome": u["nome"], "papel": u["papel"], "empresa": u["empresa"]}


@router.post("/login")
def login(dados: LoginIn, resp: Response):
    email = normalizar_email(dados.login) if "@" in dados.login else None
    telefone = None if email else normalizar_telefone(dados.login)
    with engine.begin() as conn:
        u = (_buscar(conn, email=email, telefone=telefone) or [None])[0] if (email or telefone) else None
        ok = verificar_senha(dados.senha, u["senha_hash"] if u else None)  # sempre gasta o tempo do hash
        if not u or not ok or not u["ativo"]:
            raise AppError(401, "credenciais_invalidas", "E-mail/celular ou senha incorretos")
        return _abrir_sessao(conn, resp, u["id"], u["empresa_id"], "login")


@router.post("/logout", status_code=204)
def logout(resp: Response):
    # shortcut: JWT sem lista de revogação; o token antigo vale até expirar se tiver sido copiado.
    resp.delete_cookie(COOKIE, path="/")


@router.get("/me")
def me(c: Ctx = Depends(ctx)):
    empresa = c.q("select nome from empresas where id = :e", e=c.empresa_id).scalar()
    return {"id": c.usuario_id, "nome": c.nome, "papel": c.papel, "empresa": empresa}


@router.get("/provedores")
def provedores():
    return {"google": settings.google_ativo, "verificacao_simulada": settings.verificacao_modo == "dev"}


# ---------- cadastro por e-mail ou celular (código de 6 dígitos) ----------
def _hash_codigo(cadastro_id, codigo: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"{cadastro_id}:{codigo}".encode(), hashlib.sha256).hexdigest()


def _enviar_codigo(metodo: str, destino: str, codigo: str) -> None:
    if settings.verificacao_modo != "dev":
        raise AppError(501, "envio_nao_configurado", "Envio de código por e-mail/SMS ainda não foi configurado")
    # shortcut: modo dev não envia nada; o código vai para o log e para a resposta. Trocar por SMTP/SMS em produção.
    log.warning("[cadastro dev] código %s para %s %s (não enviado)", codigo, metodo, destino)


def _criar_conta(conn: Connection, empresa: str, nome: str, email=None, telefone=None, google_sub=None,
                 senha_hash=None) -> tuple:
    r = conn.execute(text("select * from criar_conta(:emp, :nome, :e, :t, :g, :s)"),
                     {"emp": empresa, "nome": nome, "e": email, "t": telefone, "g": google_sub, "s": senha_hash}
                     ).mappings().one()
    return r["nova_empresa_id"], r["novo_usuario_id"]


@router.post("/cadastro/iniciar", status_code=201)
def cadastro_iniciar(d: CadastroIniciarIn):
    if settings.verificacao_modo != "dev":  # antes de tocar no banco: cadastro desligado não revela contas
        raise AppError(501, "envio_nao_configurado", "Envio de código por e-mail/SMS ainda não foi configurado")
    destino = normalizar_email(d.destino) if d.metodo == "email" else normalizar_telefone(d.destino)
    if not destino:
        msg = "E-mail inválido" if d.metodo == "email" else "Celular inválido: use DDD + número (ex.: 11 98765-4321)"
        raise AppError(422, "destino_invalido", msg, {"campo": "destino"})
    codigo = f"{secrets.randbelow(10**6):06d}"
    cid = uuid.uuid4()
    expira = datetime.now(timezone.utc) + CODIGO_VALIDADE
    with engine.begin() as conn:
        # shortcut: dizer que a conta já existe revela que o e-mail/celular está cadastrado; aceitável no protótipo.
        if _buscar(conn, **({"email": destino} if d.metodo == "email" else {"telefone": destino})):
            raise AppError(409, "conta_existente", "Já existe uma conta com este " +
                           ("e-mail" if d.metodo == "email" else "celular") + ". Entre pela tela de login.")
        conn.execute(text("delete from cadastros_pendentes where destino = :d"), {"d": destino})
        conn.execute(text("insert into cadastros_pendentes (id, metodo, destino, nome, empresa_nome, senha_hash, "
                          "codigo_hash, expira_em) values (:id, :m, :d, :n, :emp, :s, :c, :x)"),
                     {"id": cid, "m": d.metodo, "d": destino, "n": d.nome, "emp": d.empresa,
                      "s": hash_senha(d.senha), "c": _hash_codigo(cid, codigo), "x": expira})
    _enviar_codigo(d.metodo, destino, codigo)
    out = {"cadastro_id": str(cid), "metodo": d.metodo, "destino": destino, "expira_em": expira}
    if settings.verificacao_modo == "dev":
        out["codigo_dev"] = codigo  # só no protótipo: permite concluir o cadastro sem e-mail/SMS de verdade
    return out


@router.post("/cadastro/confirmar", status_code=201)
def cadastro_confirmar(d: CadastroConfirmarIn, resp: Response):
    erro: AppError | None = None
    with engine.begin() as conn:
        p = conn.execute(text("select * from cadastros_pendentes where id = :id and metodo in ('email','telefone') "
                              "for update"), {"id": d.cadastro_id}).mappings().first()
        if not p:
            raise AppError(404, "cadastro_nao_encontrado", "Cadastro não encontrado ou já concluído. Comece de novo.")
        if p["expira_em"] < datetime.now(timezone.utc) or p["tentativas"] >= MAX_TENTATIVAS:
            conn.execute(text("delete from cadastros_pendentes where id = :id"), {"id": p["id"]})
            erro = AppError(410, "codigo_expirado", "Código expirado ou bloqueado por tentativas. Peça um novo código.")
        elif not hmac.compare_digest(p["codigo_hash"], _hash_codigo(p["id"], d.codigo)):
            conn.execute(text("update cadastros_pendentes set tentativas = tentativas + 1 where id = :id"),
                         {"id": p["id"]})
            restantes = MAX_TENTATIVAS - p["tentativas"] - 1
            erro = AppError(422, "codigo_invalido", f"Código incorreto. Tentativas restantes: {restantes}",
                            {"campo": "codigo", "restantes": restantes})
        else:
            campo = {"email": p["destino"]} if p["metodo"] == "email" else {"telefone": p["destino"]}
            emp, uid = _criar_conta(conn, p["empresa_nome"], p["nome"], senha_hash=p["senha_hash"], **campo)
            conn.execute(text("delete from cadastros_pendentes where id = :id"), {"id": p["id"]})
            return _abrir_sessao(conn, resp, uid, emp, "criar_conta", f'{{"metodo": "{p["metodo"]}"}}')
    raise erro  # fora do `with`: o contador de tentativas e a limpeza já foram gravados


# ---------- Google (OpenID Connect, código + PKCE) ----------
def _retorno_google() -> str:
    return f"{settings.app_url}/api/auth/google/retorno"


def trocar_codigo_google(code: str, verifier: str) -> dict:
    """Troca o código pelo id_token e devolve as claims. Separado para os testes simularem o Google."""
    r = httpx.post(GOOGLE_TOKEN, timeout=10, data={
        "code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "redirect_uri": _retorno_google(), "grant_type": "authorization_code", "code_verifier": verifier})
    r.raise_for_status()
    # id_token recebido direto do Google por TLS: OIDC Core 3.1.3.7 permite confiar no canal em vez da assinatura.
    # Emissor, audiência, validade e nonce são conferidos por quem chama.
    return jwt.decode(r.json()["id_token"], options={"verify_signature": False})


def _falha_google(motivo: str, erro: str = "google") -> RedirectResponse:
    log.warning("[google] login recusado: %s", motivo)
    r = RedirectResponse(f"{settings.app_url}/login?erro={erro}", status_code=302)
    r.delete_cookie(COOKIE_OAUTH, path="/api/auth/google")
    return r


@router.get("/google/iniciar")
def google_iniciar():
    if not settings.google_ativo:
        raise AppError(404, "google_desativado", "Login com Google não está configurado")
    state, verifier, nonce = (secrets.token_urlsafe(32) for _ in range(3))
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    params = {"client_id": settings.google_client_id, "redirect_uri": _retorno_google(), "response_type": "code",
              "scope": "openid email profile", "state": state, "nonce": nonce, "code_challenge": challenge,
              "code_challenge_method": "S256", "prompt": "select_account"}
    r = RedirectResponse(f"{GOOGLE_AUTH}?{urlencode(params)}", status_code=302)
    guardado = jwt.encode({"state": state, "verifier": verifier, "nonce": nonce,
                           "exp": datetime.now(timezone.utc) + timedelta(minutes=10)}, settings.jwt_secret, "HS256")
    r.set_cookie(COOKIE_OAUTH, guardado, httponly=True, secure=settings.cookie_secure, samesite="lax",
                 max_age=600, path="/api/auth/google")
    return r


@router.get("/google/retorno")
def google_retorno(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if not settings.google_ativo:
        return _falha_google("google desativado")
    try:
        guardado = jwt.decode(request.cookies.get(COOKIE_OAUTH, ""), settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return _falha_google("cookie de estado ausente ou expirado")
    if error or not code or not state or not hmac.compare_digest(state, guardado["state"]):
        return _falha_google(error or "state inválido")
    try:
        c = trocar_codigo_google(code, guardado["verifier"])
    except Exception as e:  # rede, código inválido, resposta inesperada
        return _falha_google(f"troca do código falhou: {e!r}")
    agora = datetime.now(timezone.utc).timestamp()
    if (c.get("iss") not in GOOGLE_ISS or c.get("aud") != settings.google_client_id or c.get("exp", 0) < agora
            or c.get("nonce") != guardado["nonce"] or not c.get("sub")):
        return _falha_google("id_token inválido")
    if not c.get("email_verified") or not normalizar_email(c.get("email")):
        return _falha_google("e-mail do Google não verificado")
    sub, email = c["sub"], normalizar_email(c["email"])

    with engine.begin() as conn:
        u = (_buscar(conn, email=email, google_sub=sub) or [None])[0]
        if u:
            if not u["ativo"] or (u["google_sub"] and u["google_sub"] != sub):
                return _falha_google("usuário inativo ou e-mail ligado a outra conta Google")
            if not u["google_sub"]:
                # Nunca vincula automaticamente: a conta de senha pode ter sido criada por outra pessoa com este
                # e-mail (o código do cadastro não prova posse do e-mail no modo dev) e ela manteria o acesso.
                return _falha_google("já existe conta de senha com este e-mail", "google_conta_existente")
            r = RedirectResponse(f"{settings.app_url}/", status_code=302)
            _abrir_sessao(conn, r, u["id"], u["empresa_id"], "login", '{"metodo": "google"}')
        else:  # conta nova: falta o nome da empresa
            cid = uuid.uuid4()
            conn.execute(text("delete from cadastros_pendentes where destino = :d"), {"d": email})
            conn.execute(text("insert into cadastros_pendentes (id, metodo, destino, nome, google_sub, expira_em) "
                              "values (:id, 'google', :d, :n, :g, :x)"),
                         {"id": cid, "d": email, "n": c.get("name") or email.split("@")[0], "g": sub,
                          "x": datetime.now(timezone.utc) + timedelta(minutes=30)})
            r = RedirectResponse(f"{settings.app_url}/cadastro/google", status_code=302)
            r.set_cookie(COOKIE_CAD_GOOGLE, str(cid), httponly=True, secure=settings.cookie_secure,
                         samesite="lax", max_age=1800, path="/api/auth")
    r.delete_cookie(COOKIE_OAUTH, path="/api/auth/google")
    return r


def _pendente_google(conn: Connection, request: Request, travar: bool = False) -> dict:
    cid = request.cookies.get(COOKIE_CAD_GOOGLE)
    try:
        uuid.UUID(cid or "")
    except ValueError:
        raise AppError(404, "cadastro_nao_encontrado", "Cadastro com Google não encontrado. Entre com o Google de novo.")
    p = conn.execute(text("select * from cadastros_pendentes where id = :id and metodo = 'google' "
                          "and expira_em > now()" + (" for update" if travar else "")), {"id": cid}).mappings().first()
    if not p:
        raise AppError(404, "cadastro_nao_encontrado", "Cadastro com Google expirou. Entre com o Google de novo.")
    return dict(p)


@router.get("/cadastro/google")
def cadastro_google_dados(request: Request):
    with engine.begin() as conn:
        p = _pendente_google(conn, request)
    return {"nome": p["nome"], "email": p["destino"]}


@router.post("/cadastro/google", status_code=201)
def cadastro_google_concluir(d: CadastroGoogleIn, request: Request, resp: Response):
    with engine.begin() as conn:
        p = _pendente_google(conn, request, travar=True)
        if _buscar(conn, email=p["destino"], google_sub=p["google_sub"]):
            raise AppError(409, "conta_existente", "Já existe uma conta para este Google. Entre pela tela de login.")
        emp, uid = _criar_conta(conn, d.empresa, p["nome"], email=p["destino"], google_sub=p["google_sub"])
        conn.execute(text("delete from cadastros_pendentes where id = :id"), {"id": p["id"]})
        out = _abrir_sessao(conn, resp, uid, emp, "criar_conta", '{"metodo": "google"}')
    resp.delete_cookie(COOKIE_CAD_GOOGLE, path="/api/auth")
    return out

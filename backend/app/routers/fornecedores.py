from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, admin, ctx
from app.domain import normalizar_telefone
from app.errors import AppError, nao_encontrado
from app.schemas import FornecedorIn

router = APIRouter(prefix="/fornecedores", tags=["fornecedores"])
COLS = "id, nome, telefone, observacao, ativo, criado_em, atualizado_em"


def _obter(c: Ctx, fid) -> dict:
    r = c.um(f"select {COLS} from fornecedores where id = :id", id=fid)
    if not r:
        raise nao_encontrado("Fornecedor")
    return dict(r)


def _telefone(c: Ctx, d: FornecedorIn, fid=None) -> str:
    tel = normalizar_telefone(d.telefone)
    if not tel:
        raise AppError(422, "telefone_invalido", "Número inválido: use DDD + número (ex.: 11 98765-4321)",
                       {"campo": "telefone"})
    outro = c.um("select nome from fornecedores where telefone = :t and id is distinct from :id", t=tel, id=fid)
    if outro:
        raise AppError(409, "telefone_duplicado", f"Este número já é do fornecedor {outro['nome']}", {"campo": "telefone"})
    return tel


@router.get("")
def listar(busca: str = "", ativo: bool | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    digitos = "".join(ch for ch in busca if ch.isdigit())
    filtro = ("(:b = '' or nome ilike '%' || :b || '%' or (:dg <> '' and telefone like '%' || :dg || '%')) "
              "and (cast(:a as boolean) is null or ativo = cast(:a as boolean))")
    p = {"b": busca.strip(), "dg": digitos, "a": ativo}
    total = c.q(f"select count(*) from fornecedores where {filtro}", **p).scalar()
    itens = c.todos(f"select {COLS} from fornecedores where {filtro} order by ativo desc, lower(nome) "
                    f"limit :lim offset :off", **p, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{fid}")
def obter(fid: UUID, c: Ctx = Depends(ctx)):
    return _obter(c, fid)


@router.post("", status_code=201)
def criar(d: FornecedorIn, c: Ctx = Depends(ctx)):
    tel = _telefone(c, d)
    fid = c.q("insert into fornecedores (empresa_id, nome, telefone, observacao) values (:e, :n, :t, :o) returning id",
              e=c.empresa_id, n=d.nome, t=tel, o=d.observacao).scalar()
    c.auditar("criar", "fornecedor", fid, {"nome": d.nome})
    return _obter(c, fid)


@router.put("/{fid}")
def editar(fid: UUID, d: FornecedorIn, c: Ctx = Depends(ctx)):
    _obter(c, fid)
    tel = _telefone(c, d, fid)
    c.q("update fornecedores set nome=:n, telefone=:t, observacao=:o, atualizado_em=now() where id=:id",
        id=fid, n=d.nome, t=tel, o=d.observacao)
    c.auditar("editar", "fornecedor", fid, {"nome": d.nome})
    return _obter(c, fid)


@router.post("/{fid}/inativar")
def inativar(fid: UUID, c: Ctx = Depends(admin)):
    f = _obter(c, fid)
    c.q("update fornecedores set ativo=false, atualizado_em=now() where id=:id", id=fid)
    c.auditar("inativar", "fornecedor", fid, {"nome": f["nome"]})
    return _obter(c, fid)

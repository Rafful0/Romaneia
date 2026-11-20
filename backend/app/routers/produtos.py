from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, admin, ctx
from app.errors import AppError, nao_encontrado
from app.schemas import ProdutoIn

router = APIRouter(prefix="/produtos", tags=["produtos"])
SELECT = """select p.id, p.codigo, p.nome, p.unidade, p.ativo, p.criado_em, p.atualizado_em,
  coalesce((select array_agg(a.apelido order by a.apelido) from produto_apelidos a where a.produto_id = p.id),
           '{}') as apelidos
from produtos p"""


def _obter(c: Ctx, pid) -> dict:
    r = c.um(f"{SELECT} where p.id = :id", id=pid)
    if not r:
        raise nao_encontrado("Produto")
    return dict(r)


def _validar_unicos(c: Ctx, d: ProdutoIn, pid=None) -> None:
    if c.um("select 1 from produtos where lower(codigo) = lower(:c) and id is distinct from :id",
            c=d.codigo, id=pid):
        raise AppError(409, "codigo_duplicado", f"Já existe produto com o código '{d.codigo}'", {"campo": "codigo"})
    vistos = set()
    for ap in d.apelidos:
        if ap.lower() in vistos:
            raise AppError(422, "apelido_repetido", f"Apelido '{ap}' repetido", {"campo": "apelidos"})
        vistos.add(ap.lower())
        dono = c.um("select p.codigo from produto_apelidos a join produtos p on p.id = a.produto_id "
                    "where lower(a.apelido) = lower(:a) and a.produto_id is distinct from :id", a=ap, id=pid)
        if dono:
            raise AppError(409, "apelido_duplicado", f"Apelido '{ap}' já pertence ao produto {dono['codigo']}",
                           {"campo": "apelidos"})


def _gravar_apelidos(c: Ctx, pid, apelidos: list[str]) -> None:
    c.q("delete from produto_apelidos where produto_id = :p", p=pid)
    for ap in apelidos:
        c.q("insert into produto_apelidos (empresa_id, produto_id, apelido) values (:e, :p, :a)",
            e=c.empresa_id, p=pid, a=ap)


@router.get("")
def listar(busca: str = "", ativo: bool | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = ("(:b = '' or p.nome ilike '%' || :b || '%' or p.codigo ilike '%' || :b || '%' or exists "
              "(select 1 from produto_apelidos a where a.produto_id = p.id and a.apelido ilike '%' || :b || '%')) "
              "and (cast(:a as boolean) is null or p.ativo = cast(:a as boolean))")
    prm = {"b": busca.strip(), "a": ativo}
    total = c.q(f"select count(*) from produtos p where {filtro}", **prm).scalar()
    itens = c.todos(f"{SELECT} where {filtro} order by p.ativo desc, lower(p.nome) limit :lim offset :off",
                    **prm, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{pid}")
def obter(pid: UUID, c: Ctx = Depends(ctx)):
    return _obter(c, pid)


@router.post("", status_code=201)
def criar(d: ProdutoIn, c: Ctx = Depends(ctx)):
    _validar_unicos(c, d)
    pid = c.q("insert into produtos (empresa_id, codigo, nome, unidade) values (:e, :c, :n, :u) returning id",
              e=c.empresa_id, c=d.codigo, n=d.nome, u=d.unidade).scalar()
    _gravar_apelidos(c, pid, d.apelidos)
    c.auditar("criar", "produto", pid, d.model_dump())
    return _obter(c, pid)


@router.put("/{pid}")
def editar(pid: UUID, d: ProdutoIn, c: Ctx = Depends(ctx)):
    _obter(c, pid)
    _validar_unicos(c, d, pid)
    c.q("update produtos set codigo=:c, nome=:n, unidade=:u, atualizado_em=now() where id=:id",
        id=pid, c=d.codigo, n=d.nome, u=d.unidade)
    _gravar_apelidos(c, pid, d.apelidos)
    c.auditar("editar", "produto", pid, d.model_dump())
    return _obter(c, pid)


@router.post("/{pid}/inativar")
def inativar(pid: UUID, c: Ctx = Depends(admin)):
    r = _obter(c, pid)
    c.q("update produtos set ativo=false, atualizado_em=now() where id=:id", id=pid)
    c.auditar("inativar", "produto", pid, {"codigo": r["codigo"]})
    return _obter(c, pid)

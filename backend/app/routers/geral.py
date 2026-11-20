from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, admin, ctx

router = APIRouter(tags=["geral"])
ATIV = """select a.id, a.criado_em, a.acao, a.entidade, a.entidade_id, a.detalhes, a.usuario_id, u.nome usuario_nome
from auditoria a left join usuarios u on u.id = a.usuario_id"""


@router.get("/dashboard")
def dashboard(c: Ctx = Depends(ctx)):
    cont = c.um("""select count(*) filter (where status = 'pendente') pendentes,
                          count(*) filter (where status = 'confirmado') confirmados,
                          count(*) filter (where status = 'em_separacao') em_separacao,
                          count(*) filter (where rota_id is null and status in ('pendente','confirmado')) sem_rota
                   from pedidos""")
    recentes = c.todos(f"{ATIV} order by a.criado_em desc, a.id desc limit 10")
    return {**dict(cont), "atividade_recente": recentes}


@router.get("/usuarios")
def usuarios(c: Ctx = Depends(ctx)):
    return c.todos("select id, nome, papel, ativo from usuarios order by lower(nome)")


@router.get("/auditoria")
def auditoria(de: date | None = None, ate: date | None = None, usuario_id: UUID | None = None,
              pg: Pagina = Depends(), c: Ctx = Depends(admin)):
    # Datas do filtro são dias no fuso de operação (Brasília), não em UTC.
    filtro = """(cast(:de as date) is null or (a.criado_em at time zone 'America/Sao_Paulo')::date >= :de)
      and (cast(:ate as date) is null or (a.criado_em at time zone 'America/Sao_Paulo')::date <= :ate)
      and (cast(:u as uuid) is null or a.usuario_id = :u)"""
    prm = {"de": de, "ate": ate, "u": usuario_id}
    total = c.q(f"select count(*) from auditoria a where {filtro}", **prm).scalar()
    itens = c.todos(f"{ATIV} where {filtro} order by a.criado_em desc, a.id desc limit :lim offset :off",
                    **prm, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)

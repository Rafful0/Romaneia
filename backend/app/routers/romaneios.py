from collections import OrderedDict
from uuid import UUID

from fastapi import APIRouter, Depends

from app import domain
from app.deps import Ctx, Pagina, ctx
from app.errors import AppError, nao_encontrado
from app.schemas import SeparacaoIn

router = APIRouter(tags=["romaneios"])


def invalidar(c: Ctx, motivo: str, *, pedido_id=None, rota_id=None) -> None:
    """Marca como desatualizado todo romaneio ativo afetado por mudança em pedido/rota.

    Se a separação já começou, a mudança é bloqueada (409): não invalidamos trabalho físico em andamento.
    """
    alvos = c.todos(
        "select id, versao from romaneios r where r.status = 'ativo' and (r.rota_id = :rota or exists "
        "(select 1 from romaneio_pedidos rp where rp.romaneio_id = r.id and rp.pedido_id = :ped)) for update",
        rota=rota_id, ped=pedido_id)
    for r in alvos:
        if c.um("select 1 from romaneio_itens where romaneio_id = :r and separado_em is not null limit 1", r=r["id"]):
            raise AppError(409, "separacao_em_andamento",
                           f"O romaneio v{r['versao']} desta rota já está em separação; conclua-o antes de alterar")
        c.q("update romaneios set status = 'desatualizado', motivo_desatualizado = :m where id = :id",
            id=r["id"], m=motivo)
        c.auditar("invalidar", "romaneio", r["id"], {"motivo": motivo, "versao": r["versao"]})


def _progresso(c: Ctx, rid) -> dict:
    r = c.um("select count(*) total, count(separado_em) separados from romaneio_itens where romaneio_id = :r", r=rid)
    total, sep = r["total"], r["separados"]
    return {"total": total, "separados": sep, "percentual": round(100 * sep / total) if total else 0}


def detalhe(c: Ctx, rid) -> dict:
    r = c.um("""select r.id, r.rota_id, ro.nome rota_nome, ro.data rota_data, r.versao, r.status,
                       r.motivo_desatualizado, r.gerado_em, u.nome gerado_por_nome, r.concluido_em
                from romaneios r join rotas ro on ro.id = r.rota_id join usuarios u on u.id = r.gerado_por
                where r.id = :id""", id=rid)
    if not r:
        raise nao_encontrado("Romaneio")
    itens = c.todos("""
        select ri.id, ri.produto_id, p.codigo produto_codigo, p.nome produto_nome, ri.unidade,
               ri.quantidade_total::text quantidade_total, ri.separado_em, su.nome separado_por_nome, ri.versao,
               (select json_agg(json_build_object('pedido_numero', pe.numero, 'fornecedor_nome', fo.nome,
                                                  'quantidade', o.quantidade::text) order by pe.numero)
                  from romaneio_item_origens o join pedidos pe on pe.id = o.pedido_id
                  join fornecedores fo on fo.id = pe.fornecedor_id where o.romaneio_item_id = ri.id) origens
        from romaneio_itens ri join produtos p on p.id = ri.produto_id
        left join usuarios su on su.id = ri.separado_por
        where ri.romaneio_id = :id order by lower(p.nome), ri.unidade""", id=rid)
    linhas = c.todos("""
        select fo.id fornecedor_id, fo.nome fornecedor_nome, pe.numero, p.codigo produto_codigo, p.nome produto_nome,
               ri.unidade, o.quantidade::text quantidade
        from romaneio_item_origens o join romaneio_itens ri on ri.id = o.romaneio_item_id
        join pedidos pe on pe.id = o.pedido_id join fornecedores fo on fo.id = pe.fornecedor_id
        join produtos p on p.id = ri.produto_id
        where ri.romaneio_id = :id order by lower(fo.nome), pe.numero, lower(p.nome)""", id=rid)
    por_fornecedor: OrderedDict = OrderedDict()
    for ln in linhas:
        g = por_fornecedor.setdefault(ln["fornecedor_id"], {"fornecedor_id": ln["fornecedor_id"], "fornecedor_nome": ln["fornecedor_nome"],
                                                      "pedidos": [], "itens": []})
        if ln["numero"] not in g["pedidos"]:
            g["pedidos"].append(ln["numero"])
        g["itens"].append({k: ln[k] for k in ("produto_codigo", "produto_nome", "unidade", "quantidade")})
    pedidos = c.todos("""
        select pe.id, pe.numero, fo.nome fornecedor_nome, pe.status, rp.pedido_revisao, pe.revisao revisao_atual
        from romaneio_pedidos rp join pedidos pe on pe.id = rp.pedido_id join fornecedores fo on fo.id = pe.fornecedor_id
        where rp.romaneio_id = :id order by pe.numero""", id=rid)
    return {**dict(r), "progresso": _progresso(c, rid), "itens": itens,
            "por_fornecedor": list(por_fornecedor.values()), "pedidos": pedidos}


@router.post("/rotas/{rota_id}/romaneios", status_code=201)
def gerar(rota_id: UUID, c: Ctx = Depends(ctx)):
    rota = c.um("select id, nome from rotas where id = :id for update", id=rota_id)
    if not rota:
        raise nao_encontrado("Rota")
    if c.um("""select 1 from romaneios r where r.rota_id = :r and r.status = 'ativo' and exists
               (select 1 from romaneio_itens ri where ri.romaneio_id = r.id and ri.separado_em is not null)""",
            r=rota_id):
        raise AppError(409, "separacao_em_andamento", "Já existe romaneio em separação para esta rota")
    pedidos = c.todos("select id, numero, revisao from pedidos where rota_id = :r and status = 'confirmado' "
                      "order by numero for update", r=rota_id)
    if not pedidos:
        raise AppError(422, "sem_pedidos_elegiveis", "Não há pedidos confirmados nesta rota para gerar romaneio")
    ids = [p["id"] for p in pedidos]
    itens = c.todos("select pedido_id, produto_id, unidade, quantidade from pedido_itens where pedido_id = any(:ids)",
                    ids=ids)
    consolidado = domain.consolidar(itens)
    pendentes = c.q("select count(*) from pedidos where rota_id = :r and status = 'pendente'", r=rota_id).scalar()

    versao = c.q("select coalesce(max(versao), 0) + 1 from romaneios where rota_id = :r", r=rota_id).scalar()
    c.q("update romaneios set status = 'substituido' where rota_id = :r and status in ('ativo','desatualizado')",
        r=rota_id)
    rid = c.q("insert into romaneios (empresa_id, rota_id, versao, gerado_por) values (:e, :r, :v, :u) returning id",
              e=c.empresa_id, r=rota_id, v=versao, u=c.usuario_id).scalar()
    for p in pedidos:
        c.q("insert into romaneio_pedidos (empresa_id, romaneio_id, pedido_id, pedido_revisao) values (:e,:r,:p,:v)",
            e=c.empresa_id, r=rid, p=p["id"], v=p["revisao"])
    for (produto_id, unidade), linha in consolidado.items():
        iid = c.q("insert into romaneio_itens (empresa_id, romaneio_id, produto_id, unidade, quantidade_total) "
                  "values (:e,:r,:p,:u,:q) returning id",
                  e=c.empresa_id, r=rid, p=produto_id, u=unidade, q=linha["total"]).scalar()
        for pedido_id, qtd in linha["origens"].items():
            c.q("insert into romaneio_item_origens (empresa_id, romaneio_item_id, pedido_id, quantidade) "
                "values (:e,:i,:p,:q)", e=c.empresa_id, i=iid, p=pedido_id, q=qtd)
    c.auditar("gerar", "romaneio", rid, {"rota": rota["nome"], "versao": versao, "pedidos": len(pedidos),
                                         "linhas": len(consolidado), "pendentes_ignorados": pendentes})
    return {**detalhe(c, rid), "pendentes_ignorados": pendentes}


@router.get("/romaneios")
def listar(rota_id: UUID | None = None, status: str | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = "(cast(:rota as uuid) is null or r.rota_id = :rota) and (cast(:st as text) is null or r.status = :st)"
    prm = {"rota": rota_id, "st": status}
    total = c.q(f"select count(*) from romaneios r where {filtro}", **prm).scalar()
    itens = c.todos(f"""
        select r.id, r.rota_id, ro.nome rota_nome, ro.data rota_data, r.versao, r.status, r.gerado_em,
               (select count(*) from romaneio_itens ri where ri.romaneio_id = r.id) total_itens,
               (select count(separado_em) from romaneio_itens ri where ri.romaneio_id = r.id) separados,
               (select count(*) from romaneio_pedidos rp where rp.romaneio_id = r.id) total_pedidos
        from romaneios r join rotas ro on ro.id = r.rota_id where {filtro}
        order by r.gerado_em desc limit :lim offset :off""", **prm, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/romaneios/{rid}")
def obter(rid: UUID, c: Ctx = Depends(ctx)):
    return detalhe(c, rid)


@router.post("/romaneios/{rid}/itens/{iid}/separacao")
def separar(rid: UUID, iid: UUID, d: SeparacaoIn, c: Ctx = Depends(ctx)):
    r = c.um("select id, status, versao from romaneios where id = :id for update", id=rid)
    if not r:
        raise nao_encontrado("Romaneio")
    permitidos = {"ativo"} if d.separado else {"ativo", "concluido"}
    if r["status"] not in permitidos:
        msg = ("Romaneio desatualizado: gere uma nova versão antes de separar" if r["status"] == "desatualizado"
               else f"Romaneio está '{r['status']}' e não aceita esta operação")
        raise AppError(409, "romaneio_nao_ativo", msg)
    it = c.um("""select ri.id, ri.versao, ri.separado_em, su.nome separado_por_nome from romaneio_itens ri
                 left join usuarios su on su.id = ri.separado_por
                 where ri.id = :i and ri.romaneio_id = :r for update of ri""", i=iid, r=rid)
    if not it:
        raise nao_encontrado("Item do romaneio")
    if it["versao"] != d.versao or (it["separado_em"] is not None) == d.separado:
        quem = it["separado_por_nome"]
        msg = (f"Este item foi alterado por outra pessoa ({quem} marcou como separado)" if quem
               else "Este item foi alterado por outra pessoa; recarregue para ver o estado atual")
        raise AppError(409, "conflito_separacao", msg,
                       {"versao_atual": it["versao"], "separado_por_nome": quem, "separado_em": it["separado_em"]})

    c.q("""update romaneio_itens set separado_por = case when :s then cast(:u as uuid) end,
           separado_em = case when :s then now() end, versao = versao + 1 where id = :i""",
        s=d.separado, u=c.usuario_id, i=iid)
    ped = "select pedido_id from romaneio_pedidos where romaneio_id = :r"
    if d.separado:
        c.q(f"update pedidos set status = 'em_separacao', atualizado_em = now() "
            f"where id in ({ped}) and status = 'confirmado'", r=rid)
    prog = _progresso(c, rid)
    if prog["separados"] == prog["total"]:
        c.q("update romaneios set status = 'concluido', concluido_em = now() where id = :r", r=rid)
        c.q(f"update pedidos set status = 'separado', atualizado_em = now() "
            f"where id in ({ped}) and status = 'em_separacao'", r=rid)
        c.auditar("concluir", "romaneio", rid)
    elif r["status"] == "concluido":
        c.q("update romaneios set status = 'ativo', concluido_em = null where id = :r", r=rid)
        c.q(f"update pedidos set status = 'em_separacao', atualizado_em = now() "
            f"where id in ({ped}) and status = 'separado'", r=rid)
    c.auditar("separar" if d.separado else "desmarcar", "romaneio_item", iid, {"romaneio_id": str(rid)})
    return detalhe(c, rid)

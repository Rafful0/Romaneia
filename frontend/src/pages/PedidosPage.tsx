import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ButtonLink, Badge, Button, EmptyState, Field, Input, PageHeader, Pagination, QueryState, Select, StatusPedidoBadge, Table, Td } from '../components/ui'
import { data, STATUS_PEDIDO } from '../lib/format'
import { api } from '../services/api'

export function PedidosPage() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const filtros = { status: sp.get('status') ?? '', de: sp.get('de') ?? '', ate: sp.get('ate') ?? '', page: Number(sp.get('page') ?? 1) }
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    if (k !== 'page') n.delete('page')
    setSp(n, { replace: true })
  }
  const q = useQuery({ queryKey: ['pedidos', filtros], queryFn: () => api.pedidos.listar(filtros), placeholderData: keepPreviousData })
  const novo = <ButtonLink to="/pedidos/novo">Novo pedido</ButtonLink>
  return (
    <>
      <PageHeader titulo="Pedidos" acoes={novo} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status" className="w-44">
          {(id) => (
            <Select id={id} value={filtros.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_PEDIDO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Entrega de" className="w-40">{(id) => <Input id={id} type="date" value={filtros.de} onChange={(e) => set('de', e.target.value)} />}</Field>
        <Field label="Entrega até" className="w-40">{(id) => <Input id={id} type="date" value={filtros.ate} onChange={(e) => set('ate', e.target.value)} />}</Field>
        {(filtros.status || filtros.de || filtros.ate) && <Button variant="ghost" onClick={() => setSp({}, { replace: true })}>Limpar filtros</Button>}
      </div>
      <QueryState q={q} vazio={(d) => d.total === 0 && <EmptyState titulo="Nenhum pedido encontrado." acao={novo} />}>
        {(d) => (
          <>
            <Table head={['Nº', 'Cliente', 'Entrega', 'Status', 'Itens', 'Rota']}>
              {d.items.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => nav(`/pedidos/${p.id}`)}>
                  <Td className="font-mono"><Link to={`/pedidos/${p.id}`} className="hover:text-brand" onClick={(e) => e.stopPropagation()}>#{p.numero}</Link></Td>
                  <Td className="font-medium">{p.cliente_nome}</Td>
                  <Td>{data(p.data_entrega)}</Td>
                  <Td><StatusPedidoBadge s={p.status} /></Td>
                  <Td>{p.qtd_itens}{p.nao_identificados > 0 && <span className="ml-2"><Badge tom="amarelo">{p.nao_identificados} não identificado(s)</Badge></span>}</Td>
                  <Td className="text-muted">{p.rota_nome ?? '—'}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={(n) => set('page', String(n))} />
          </>
        )}
      </QueryState>
    </>
  )
}

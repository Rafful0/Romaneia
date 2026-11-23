import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink, EmptyState, Field, Num, PageHeader, Pagination, QueryState, Select, StatusRomaneioBadge, Table, Td } from '../components/ui'
import { data, dataHora, STATUS_ROMANEIO } from '../lib/format'
import { api } from '../services/api'

export function RomaneiosPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['romaneios', status, page], queryFn: () => api.romaneios.listar({ status, page }), placeholderData: keepPreviousData })
  return (
    <>
      <PageHeader titulo="Romaneios" sub="Romaneios são gerados a partir dos pedidos confirmados de uma rota." />
      <Field label="Status" className="mb-4 w-44">
        {(id) => (
          <Select id={id} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {Object.entries(STATUS_ROMANEIO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </Select>
        )}
      </Field>
      <QueryState q={q} vazio={(d) => d.total === 0 && (
        <EmptyState titulo="Nenhum romaneio gerado." acao={<ButtonLink to="/rotas">Ir para rotas</ButtonLink>} />)}>
        {(d) => (
          <>
            <Table head={['Rota', 'Data', 'Versão', 'Status', <Num>Pedidos</Num>, <Num>Separação</Num>, 'Gerado em']}>
              {d.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td><Link to={`/romaneios/${r.id}`} className="font-medium hover:text-brand">{r.rota_nome}</Link></Td>
                  <Td>{data(r.rota_data)}</Td>
                  <Td className="font-mono text-xs text-ink-2">v{r.versao}</Td>
                  <Td><StatusRomaneioBadge s={r.status} /></Td>
                  <Td className="text-right">{r.total_pedidos}</Td>
                  <Td className="text-right">{r.separados}/{r.total_itens}</Td>
                  <Td className="text-muted">{dataHora(r.gerado_em)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  )
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { EmptyState, ErrorState, Field, Input, PageHeader, Pagination, QueryState, Select, Table, Td } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { dataHora, descreverAtividade } from '../lib/format'
import { api } from '../services/api'

export function HistoricoPage() {
  const { usuario } = useAuth()
  const [f, setF] = useState({ de: '', ate: '', usuario_id: '', page: 1 })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v, page: 1 }))
  const admin = usuario?.papel === 'admin'
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: api.usuarios, enabled: admin })
  const q = useQuery({ queryKey: ['auditoria', f], queryFn: () => api.auditoria(f), placeholderData: keepPreviousData, enabled: admin })
  if (!admin) return <ErrorState erro={new Error('Apenas administradores podem ver o histórico.')} onRetry={() => history.back()} />
  return (
    <>
      <PageHeader titulo="Histórico" sub="Registro de auditoria das operações (somente leitura)." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="De" className="w-40">{(id) => <Input id={id} type="date" value={f.de} onChange={(e) => set('de', e.target.value)} />}</Field>
        <Field label="Até" className="w-40">{(id) => <Input id={id} type="date" value={f.ate} onChange={(e) => set('ate', e.target.value)} />}</Field>
        <Field label="Usuário" className="w-56">
          {(id) => (
            <Select id={id} value={f.usuario_id} onChange={(e) => set('usuario_id', e.target.value)}>
              <option value="">Todos</option>
              {usuarios.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <QueryState q={q} vazio={(d) => d.total === 0 && <EmptyState titulo="Nenhum registro no período." />}>
        {(d) => (
          <>
            <Table head={['Quando', 'Usuário', 'Operação', 'Detalhes']}>
              {d.items.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap text-muted">{dataHora(a.criado_em)}</Td>
                  <Td>{a.usuario_nome ?? 'Sistema'}</Td>
                  <Td>{descreverAtividade(a.acao, a.entidade, a.detalhes)}</Td>
                  <Td className="max-w-md truncate text-xs text-muted" >
                    {Object.entries(a.detalhes).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ') || '—'}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
          </>
        )}
      </QueryState>
    </>
  )
}

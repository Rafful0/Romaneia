import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button, EmptyState, Field, Input, Modal, Num, PageHeader, Pagination, QueryState, StatusPedidoBadge, StatusRomaneioBadge, Table, Td } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { data, hojeISO } from '../lib/format'
import { api } from '../services/api'

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(200),
  data: z.string().min(1, 'Informe a data'),
  observacao: z.string().trim().max(500).transform((v) => v || null),
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

function NovaRota({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const f = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema), defaultValues: { nome: '', data: hojeISO(), observacao: '' } })
  const m = useMutation({
    mutationFn: api.rotas.criar,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['rotas'] }); toast.ok('Rota criada'); onFechar(); nav(`/rotas/${r.id}`) },
    onError: toast.erro,
  })
  const e = f.formState.errors
  return (
    <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-3">
      <Field label="Nome *" erro={e.nome?.message}>{(id) => <Input id={id} placeholder="ex.: Zona Norte" aria-invalid={!!e.nome} {...f.register('nome')} />}</Field>
      <Field label="Data *" erro={e.data?.message}>{(id) => <Input id={id} type="date" aria-invalid={!!e.data} {...f.register('data')} />}</Field>
      <Field label="Observação">{(id) => <Input id={id} {...f.register('observacao')} />}</Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button type="submit" loading={m.isPending}>Criar rota</Button>
      </div>
    </form>
  )
}

export function RotasPage() {
  const [page, setPage] = useState(1)
  const [filtroData, setFiltroData] = useState('')
  const [criando, setCriando] = useState(false)
  const rotas = useQuery({ queryKey: ['rotas', filtroData, page], queryFn: () => api.rotas.listar({ data: filtroData, page }), placeholderData: keepPreviousData })
  const semRota = useQuery({ queryKey: ['pedidos', 'sem_rota'], queryFn: () => api.pedidos.listar({ sem_rota: true, page_size: 100 }) })
  const nova = <Button onClick={() => setCriando(true)}>Nova rota</Button>
  return (
    <>
      <PageHeader titulo="Rotas" sub="Montagem manual: crie a rota e inclua os pedidos." acoes={nova} />
      <Field label="Filtrar por data" className="mb-4 w-44">
        {(id) => <Input id={id} type="date" value={filtroData} onChange={(e) => { setFiltroData(e.target.value); setPage(1) }} />}
      </Field>
      <QueryState q={rotas} vazio={(d) => d.total === 0 && <EmptyState titulo="Nenhuma rota." acao={nova} />}>
        {(d) => (
          <>
            <Table head={['Rota', 'Data', <Num>Pedidos</Num>, <Num>Confirmados</Num>, 'Romaneio']}>
              {d.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td><Link to={`/rotas/${r.id}`} className="font-medium hover:text-brand">{r.nome}</Link></Td>
                  <Td>{data(r.data)}</Td>
                  <Td className="text-right">{r.total_pedidos}</Td>
                  <Td className="text-right">{r.confirmados}</Td>
                  <Td>{r.romaneio_atual ? <span className="flex items-center gap-2"><span className="font-mono text-xs text-ink-2">v{r.romaneio_atual.versao}</span> <StatusRomaneioBadge s={r.romaneio_atual.status} /></span> : <span className="text-muted">—</span>}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-2">Pedidos sem rota</h2>
      <QueryState q={semRota} vazio={(d) => d.total === 0 && <EmptyState titulo="Todos os pedidos abertos já estão em uma rota." />}>
        {(d) => (
          <Table head={['Nº', 'Cliente', 'Entrega', 'Status']}>
            {d.items.map((p) => (
              <tr key={p.id}>
                <Td><Link to={`/pedidos/${p.id}`} className="font-mono hover:text-brand">#{p.numero}</Link></Td>
                <Td>{p.cliente_nome}</Td>
                <Td>{data(p.data_entrega)}</Td>
                <Td><StatusPedidoBadge s={p.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryState>
      <Modal titulo="Nova rota" aberto={criando} onClose={() => setCriando(false)}>
        {criando && <NovaRota onFechar={() => setCriando(false)} />}
      </Modal>
    </>
  )
}

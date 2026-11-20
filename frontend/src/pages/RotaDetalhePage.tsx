import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, Card, EmptyState, Field, PageHeader, QueryState, Select, StatusPedidoBadge, StatusRomaneioBadge, Table, Td } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { data, dataHora } from '../lib/format'
import { api } from '../services/api'
import type { PedidoNaRota, Rota } from '../types'

export function RotaDetalhePage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const [escolhido, setEscolhido] = useState('')
  const [removendo, setRemovendo] = useState<PedidoNaRota | null>(null)
  const q = useQuery({ queryKey: ['rota', id], queryFn: () => api.rotas.obter(id!) })
  const semRota = useQuery({ queryKey: ['pedidos', 'sem_rota'], queryFn: () => api.pedidos.listar({ sem_rota: true, page_size: 100 }) })
  const aoMudar = (r: Rota) => {
    qc.setQueryData(['rota', id], r)
    for (const k of ['pedidos', 'rotas', 'dashboard', 'romaneios', 'romaneio']) qc.invalidateQueries({ queryKey: [k] })
  }
  const associar = useMutation({
    mutationFn: (pid: string) => api.rotas.associar(id!, pid),
    onSuccess: (r) => { aoMudar(r); setEscolhido(''); toast.ok('Pedido incluído na rota') },
    onError: toast.erro,
  })
  const remover = useMutation({
    mutationFn: (pid: string) => api.rotas.remover(id!, pid),
    onSuccess: (r) => { aoMudar(r); setRemovendo(null); toast.ok('Pedido removido da rota') },
    onError: toast.erro,
  })
  const gerar = useMutation({
    mutationFn: () => api.rotas.gerarRomaneio(id!),
    onSuccess: (rom) => {
      qc.invalidateQueries({ queryKey: ['rota', id] }); qc.invalidateQueries({ queryKey: ['romaneios'] })
      toast.ok(`Romaneio v${rom.versao} gerado` + (rom.pendentes_ignorados ? ` (${rom.pendentes_ignorados} pedido(s) pendente(s) ficaram de fora)` : ''))
      nav(`/romaneios/${rom.id}`)
    },
    onError: toast.erro,
  })
  return (
    <QueryState q={q}>
      {(r) => {
        const pendentes = r.pedidos.filter((p) => p.status === 'pendente').length
        const atual = r.romaneios[0]
        return (
          <>
            <PageHeader titulo={r.nome} sub={`${data(r.data)} · ${r.total_pedidos} pedido(s), ${r.confirmados} confirmado(s)`}
              acoes={<Button loading={gerar.isPending} disabled={r.confirmados === 0}
                title={r.confirmados === 0 ? 'Confirme ao menos um pedido da rota' : undefined}
                onClick={() => gerar.mutate()}>{atual ? 'Gerar nova versão do romaneio' : 'Gerar romaneio'}</Button>} />
            {pendentes > 0 && <p className="mb-3 text-sm text-warn">{pendentes} pedido(s) pendente(s) não entram no romaneio até serem confirmados.</p>}
            {atual?.status === 'desatualizado' && (
              <div role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
                O romaneio v{atual.versao} está desatualizado: pedidos mudaram depois da geração. Gere uma nova versão.
              </div>
            )}

            <Card className="mb-4">
              <h2 className="mb-3 text-sm font-semibold">Incluir pedido</h2>
              <QueryState q={semRota}>
                {(d) => d.items.length === 0 ? <p className="text-sm text-muted">Não há pedidos sem rota.</p> : (
                  <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (escolhido) associar.mutate(escolhido) }}>
                    <Field label="Pedido sem rota" className="min-w-72 flex-1">
                      {(fid) => (
                        <Select id={fid} value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                          <option value="">Selecione…</option>
                          {d.items.map((p) => <option key={p.id} value={p.id}>#{p.numero} — {p.cliente_nome} ({p.status}, entrega {data(p.data_entrega)})</option>)}
                        </Select>
                      )}
                    </Field>
                    <Button type="submit" disabled={!escolhido} loading={associar.isPending}>Incluir</Button>
                  </form>
                )}
              </QueryState>
            </Card>

            {r.pedidos.length === 0 ? <EmptyState titulo="Nenhum pedido nesta rota." /> : (
              <Table head={['Nº', 'Cliente', 'Entrega', 'Status', 'Itens', '']}>
                {r.pedidos.map((p) => (
                  <tr key={p.id}>
                    <Td><Link to={`/pedidos/${p.id}`} className="font-mono hover:text-brand">#{p.numero}</Link></Td>
                    <Td>{p.cliente_nome}</Td>
                    <Td>{data(p.data_entrega)}</Td>
                    <Td><StatusPedidoBadge s={p.status} /></Td>
                    <Td>{p.qtd_itens}{p.nao_identificados > 0 && <span className="ml-2"><Badge tom="amarelo">{p.nao_identificados} não ident.</Badge></span>}</Td>
                    <Td className="text-right">
                      {(p.status === 'pendente' || p.status === 'confirmado') && <Button variant="ghost" onClick={() => setRemovendo(p)}>Remover</Button>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}

            <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Romaneios desta rota</h2>
            {r.romaneios.length === 0 ? <EmptyState titulo="Nenhum romaneio gerado ainda." /> : (
              <Table head={['Versão', 'Status', 'Gerado em', '']}>
                {r.romaneios.map((ro) => (
                  <tr key={ro.id}>
                    <Td>v{ro.versao}</Td>
                    <Td><StatusRomaneioBadge s={ro.status} /></Td>
                    <Td>{dataHora(ro.gerado_em)}</Td>
                    <Td className="text-right"><Link to={`/romaneios/${ro.id}`} className="text-brand hover:underline">Abrir</Link></Td>
                  </tr>
                ))}
              </Table>
            )}
            <ConfirmDialog aberto={!!removendo} titulo="Remover pedido da rota" confirmar="Remover" enviando={remover.isPending}
              mensagem={`O pedido #${removendo?.numero} voltará para "sem rota". Um romaneio já gerado ficará desatualizado.`}
              onCancel={() => setRemovendo(null)} onConfirm={() => removendo && remover.mutate(removendo.id)} />
          </>
        )
      }}
    </QueryState>
  )
}

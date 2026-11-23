import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ButtonLink, Badge, Button, Card, Num, PageHeader, Qtd, QueryState, StatusPedidoBadge, Table, Td } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { data, dataHora, qtd } from '../lib/format'
import { useAuth } from '../hooks/useAuth'
import { linkWhatsApp } from '../lib/whatsapp'
import { api } from '../services/api'
import type { Pedido } from '../types'

export function PedidoDetalhePage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const { usuario } = useAuth()
  const [cancelando, setCancelando] = useState(false)
  const q = useQuery({ queryKey: ['pedido', id], queryFn: () => api.pedidos.obter(id!) })
  const atualizar = (p: Pedido) => {
    qc.setQueryData(['pedido', id], p)
    for (const k of ['pedidos', 'dashboard', 'rota', 'rotas', 'romaneio', 'romaneios']) qc.invalidateQueries({ queryKey: [k] })
  }
  const confirmar = useMutation({
    mutationFn: () => api.pedidos.confirmar(id!),
    onSuccess: (p) => { atualizar(p); toast.ok(`Pedido #${p.numero} confirmado`) },
    onError: toast.erro,
  })
  const cancelar = useMutation({
    mutationFn: (motivo: string) => api.pedidos.cancelar(id!, motivo),
    onSuccess: (p) => { atualizar(p); setCancelando(false); toast.ok(`Pedido #${p.numero} cancelado`) },
    onError: toast.erro,
  })
  return (
    <QueryState q={q}>
      {(p) => {
        const editavel = p.status === 'pendente' || p.status === 'confirmado'
        const whatsapp = linkWhatsApp(p, usuario?.empresa ?? '')
        return (
          <>
            <PageHeader titulo={`Pedido #${p.numero}`} sub={<span className="flex items-center gap-2"><StatusPedidoBadge s={p.status} /> revisão {p.revisao}</span>}
              acoes={<>
                {whatsapp
                  ? <ButtonLink to={whatsapp} target="_blank" rel="noopener noreferrer" variant="secondary">Enviar no WhatsApp</ButtonLink>
                  : <Button variant="secondary" disabled>WhatsApp: fornecedor sem número válido</Button>}
                {editavel && <ButtonLink to={`/pedidos/${p.id}/editar`} variant="secondary">Editar</ButtonLink>}
                {p.status === 'pendente' && <Button loading={confirmar.isPending} onClick={() => confirmar.mutate()}>Confirmar pedido</Button>}
                {editavel && <Button variant="danger" onClick={() => setCancelando(true)}>Cancelar pedido</Button>}
              </>} />
            {p.nao_identificados > 0 && (
              <div role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
                {p.nao_identificados} item(ns) sem produto identificado. Edite o pedido e escolha o produto antes de confirmar.
              </div>
            )}
            {p.status === 'cancelado' && (
              <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                Cancelado. Motivo: {p.motivo_cancelamento}
              </div>
            )}
            <Card className="mb-4 text-sm">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-muted">Fornecedor</dt><dd className="mt-0.5 font-medium">{p.fornecedor_nome}</dd></div>
                <div><dt className="text-xs text-muted">Entrega</dt><dd className="mt-0.5">{data(p.data_entrega)}</dd></div>
                <div><dt className="text-xs text-muted">Rota</dt><dd className="mt-0.5">{p.rota_id ? <Link className="text-brand hover:underline" to={`/rotas/${p.rota_id}`}>{p.rota_nome} ({data(p.rota_data)})</Link> : 'Sem rota'}</dd></div>
                <div><dt className="text-xs text-muted">Criado por</dt><dd className="mt-0.5">{p.criado_por_nome} em {dataHora(p.criado_em)}</dd></div>
                {p.observacao && <div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs text-muted">Observação</dt><dd className="mt-0.5">{p.observacao}</dd></div>}
              </dl>
            </Card>
            <Table head={['#', 'Produto', 'Descrição original', <Num>Quantidade</Num>]}>
              {p.itens.map((i) => (
                <tr key={i.id}>
                  <Td className="w-10 text-muted">{i.posicao + 1}</Td>
                  <Td>{i.produto_id ? <><span className="font-mono text-xs text-muted">{i.produto_codigo}</span> {i.produto_nome}</> : <Badge tom="amarelo">Não identificado</Badge>}</Td>
                  <Td className="text-muted">{i.texto_original ?? '—'}</Td>
                  <Td className="text-right"><Qtd v={qtd(i.quantidade)} un={i.unidade} /></Td>
                </tr>
              ))}
            </Table>
            <ConfirmDialog aberto={cancelando} titulo={`Cancelar pedido #${p.numero}`} pedirMotivo confirmar="Cancelar pedido"
              mensagem="O cancelamento não pode ser desfeito. Se o pedido estiver em um romaneio, ele ficará desatualizado."
              enviando={cancelar.isPending} onCancel={() => setCancelando(false)} onConfirm={(m) => cancelar.mutate(m)} />
          </>
        )
      }}
    </QueryState>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { hojeISO, qtd, UNIDADES } from '../lib/format'
import { itemVazio, pedidoSchema, type PedidoForm } from '../lib/pedidoSchema'
import { api } from '../services/api'
import type { PedidoIn, Unidade } from '../types'

export function PedidoFormPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  // shortcut: carrega até 100 clientes/produtos ativos em <select>; trocar por busca (combobox) quando o cadastro crescer.
  const clientes = useQuery({ queryKey: ['clientes', 'ativos'], queryFn: () => api.clientes.listar({ ativo: true, page_size: 100 }) })
  const produtos = useQuery({ queryKey: ['produtos', 'ativos'], queryFn: () => api.produtos.listar({ ativo: true, page_size: 100 }) })
  const pedido = useQuery({ queryKey: ['pedido', id], queryFn: () => api.pedidos.obter(id!), enabled: !!id })

  const f = useForm<PedidoForm, unknown, PedidoIn>({
    resolver: zodResolver(pedidoSchema),
    defaultValues: { cliente_id: '', data_entrega: hojeISO(), observacao: '', itens: [itemVazio()] },
  })
  const itens = useFieldArray({ control: f.control, name: 'itens' })
  // Sugestão: o que clientes do mesmo tipo de comércio mais pedem (histórico real, últimos 90 dias).
  const clienteId = f.watch('cliente_id')
  const tipoId = clientes.data?.items.find((c) => c.id === clienteId)?.tipo_comercio_id
  const sugestoes = useQuery({
    queryKey: ['tipos-comercio', 'leitura', tipoId, 90], queryFn: () => api.tiposComercio.leitura(tipoId!, 90), enabled: !!tipoId,
  })
  const valores = f.watch('itens')
  const jaTem = (pid: string, un: string) => valores.some((i) => i.produto_id === pid && i.unidade === un)
  const adicionar = (pid: string, un: Unidade) => {
    const vazio = valores.findIndex((i) => !i.produto_id && !i.texto_original && !i.quantidade)
    if (vazio < 0) return itens.append({ produto_id: pid, texto_original: '', quantidade: '', unidade: un })
    f.setValue(`itens.${vazio}.produto_id`, pid)
    f.setValue(`itens.${vazio}.unidade`, un)
  }
  useEffect(() => {
    const p = pedido.data
    if (p) f.reset({
      cliente_id: p.cliente_id, data_entrega: p.data_entrega, observacao: p.observacao ?? '',
      itens: p.itens.map((i) => ({ produto_id: i.produto_id ?? '', texto_original: i.texto_original ?? '', quantidade: qtd(i.quantidade), unidade: i.unidade })),
    })
  }, [pedido.data, f])

  const salvar = useMutation({
    mutationFn: (d: PedidoIn) => (id ? api.pedidos.editar(id, d) : api.pedidos.criar(d)),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.setQueryData(['pedido', p.id], p)
      toast.ok(id ? `Pedido #${p.numero} atualizado` : `Pedido #${p.numero} criado`)
      nav(`/pedidos/${p.id}`)
    },
    onError: toast.erro,
  })

  const falha = [clientes, produtos, pedido].find((q) => q.isError)
  if (falha) return <ErrorState erro={falha.error} onRetry={() => falha.refetch()} />
  if (clientes.isPending || produtos.isPending || (id && pedido.isPending)) return <div className="flex justify-center py-10"><Spinner /></div>
  if (pedido.data && !['pendente', 'confirmado'].includes(pedido.data.status)) {
    return <ErrorState erro={new Error('Este pedido não pode mais ser editado.')} onRetry={() => nav(`/pedidos/${id}`)} />
  }

  const listaClientes = clientes.data!.items
  const clienteAtualFora = pedido.data && !listaClientes.some((c) => c.id === pedido.data!.cliente_id)
  const prods = produtos.data!.items
  const sugeridos = (sugestoes.data?.itens ?? []).filter((s) => prods.some((p) => p.id === s.produto_id)).slice(0, 8)
  const e = f.formState.errors
  return (
    <>
      <PageHeader titulo={id ? `Editar pedido #${pedido.data?.numero}` : 'Novo pedido'}
        sub={pedido.data?.status === 'confirmado' ? 'Pedido confirmado: alterar invalida o romaneio já gerado para a rota.' : undefined} />
      <form noValidate onSubmit={f.handleSubmit((d) => salvar.mutate(d))} className="flex flex-col gap-4">
        <Card className="grid gap-3 md:grid-cols-3">
          <Field label="Cliente *" erro={e.cliente_id?.message}>
            {(fid) => (
              <Select id={fid} aria-invalid={!!e.cliente_id} {...f.register('cliente_id')}>
                <option value="">Selecione…</option>
                {clienteAtualFora && <option value={pedido.data!.cliente_id}>{pedido.data!.cliente_nome} (inativo)</option>}
                {listaClientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Data de entrega *" erro={e.data_entrega?.message}>
            {(fid) => <Input id={fid} type="date" aria-invalid={!!e.data_entrega} {...f.register('data_entrega')} />}
          </Field>
          <Field label="Observação" className="md:col-span-3">{(fid) => <Textarea id={fid} rows={2} {...f.register('observacao')} />}</Field>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Itens</h2>
            <Button type="button" variant="secondary" onClick={() => itens.append(itemVazio())}>Adicionar item</Button>
          </div>
          {tipoId && sugestoes.data && (
            <div className="mb-4 rounded border-l-2 border-brand/70 bg-surface-2 px-3 py-2.5" data-testid="sugestoes">
              {sugeridos.length === 0
                ? <p className="text-xs text-muted">Ainda não há histórico de pedidos para o tipo <strong className="text-ink">{sugestoes.data.tipo.nome}</strong>.</p>
                : (
                  <>
                    <p className="mb-2 text-xs text-muted">Mais pedidos por clientes do tipo <strong className="text-ink">{sugestoes.data.tipo.nome}</strong> (últimos 90 dias). Clique para adicionar:</p>
                    <div className="flex flex-wrap gap-2">
                      {sugeridos.map((s) => {
                        const tem = jaTem(s.produto_id, s.unidade)
                        return (
                          <Button key={s.produto_id + s.unidade} type="button" variant="secondary" disabled={tem}
                            aria-label={`${tem ? 'Já adicionado' : 'Adicionar'}: ${s.produto_nome} em ${s.unidade}`}
                            onClick={() => adicionar(s.produto_id, s.unidade)}>
                            {tem ? '✓' : '+'} {s.produto_nome} ({s.unidade})
                          </Button>
                        )
                      })}
                    </div>
                  </>
                )}
            </div>
          )}
          {e.itens?.root?.message && <p role="alert" className="mb-2 text-xs text-danger">{e.itens.root.message}</p>}
          {e.itens?.message && <p role="alert" className="mb-2 text-xs text-danger">{e.itens.message}</p>}
          <div className="flex flex-col divide-y divide-line">
            {itens.fields.map((campo, n) => {
              const ie = e.itens?.[n]
              const produtoId = f.watch(`itens.${n}.produto_id`)
              return (
                <div key={campo.id} className="grid items-start gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[2fr_2fr_1fr_1fr_auto]" data-testid="item-pedido">
                  <Field label={`Produto (item ${n + 1})`}>
                    {(fid) => (
                      <Select id={fid} {...f.register(`itens.${n}.produto_id`, {
                        onChange: (ev) => {
                          const p = prods.find((x) => x.id === ev.target.value)
                          if (p) f.setValue(`itens.${n}.unidade`, p.unidade, { shouldValidate: f.formState.isSubmitted })
                        },
                      })}>
                        <option value="">Não identificado (descrever)</option>
                        {prods.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome} ({p.unidade})</option>)}
                        {campo.produto_id && !prods.some((p) => p.id === campo.produto_id) && <option value={campo.produto_id}>Produto inativo</option>}
                      </Select>
                    )}
                  </Field>
                  <Field label={produtoId ? 'Descrição original' : 'Descrição do item *'} erro={ie?.texto_original?.message}>
                    {(fid) => <Input id={fid} placeholder={produtoId ? 'opcional' : 'como o cliente pediu'} aria-invalid={!!ie?.texto_original} {...f.register(`itens.${n}.texto_original`)} />}
                  </Field>
                  <Field label="Quantidade *" erro={ie?.quantidade?.message}>
                    {(fid) => <Input id={fid} inputMode="decimal" className="text-right font-semibold" aria-invalid={!!ie?.quantidade} {...f.register(`itens.${n}.quantidade`)} />}
                  </Field>
                  <Field label="Unidade *" erro={ie?.unidade?.message}>
                    {(fid) => (
                      <Select id={fid} className="font-mono" aria-invalid={!!ie?.unidade} {...f.register(`itens.${n}.unidade`)}>
                        <option value="">—</option>
                        {UNIDADES.map((u) => <option key={u.valor} value={u.valor as Unidade}>{u.valor}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Button type="button" variant="ghost" className="md:mt-5" disabled={itens.fields.length === 1}
                    aria-label={`Remover item ${n + 1}`} onClick={() => itens.remove(n)}>Remover</Button>
                </div>
              )
            })}
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancelar</Button>
          <Button type="submit" loading={salvar.isPending}>{id ? 'Salvar alterações' : 'Criar pedido'}</Button>
        </div>
      </form>
    </>
  )
}

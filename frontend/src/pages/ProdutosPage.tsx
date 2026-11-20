import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Pagination, QueryState, Select, Table, Td } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import { UNIDADES } from '../lib/format'
import { api } from '../services/api'
import type { Produto, ProdutoIn, Unidade } from '../types'

const schema = z.object({
  codigo: z.string().trim().min(1, 'Informe o código').max(50),
  nome: z.string().trim().min(1, 'Informe o nome').max(200),
  unidade: z.enum(UNIDADES.map((u) => u.valor) as [Unidade, ...Unidade[]], { message: 'Escolha a unidade' }),
  // Apelidos digitados separados por vírgula; repetidos são erro, não removidos em silêncio.
  apelidos: z.string().transform((s, ctx) => {
    const lista = s.split(',').map((x) => x.trim()).filter(Boolean)
    const visto = new Set<string>()
    for (const a of lista) {
      if (visto.has(a.toLowerCase())) ctx.addIssue({ code: 'custom', message: `Apelido "${a}" repetido` })
      visto.add(a.toLowerCase())
    }
    return lista
  }),
})
type FormIn = z.input<typeof schema>

function ProdutoForm({ inicial, onFechar }: { inicial?: Produto; onFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const f = useForm<FormIn, unknown, ProdutoIn>({
    resolver: zodResolver(schema),
    defaultValues: { codigo: inicial?.codigo ?? '', nome: inicial?.nome ?? '', unidade: inicial?.unidade ?? ('' as Unidade), apelidos: inicial?.apelidos.join(', ') ?? '' },
  })
  const m = useMutation({
    mutationFn: (d: ProdutoIn) => (inicial ? api.produtos.editar(inicial.id, d) : api.produtos.criar(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos'] }); toast.ok(inicial ? 'Produto atualizado' : 'Produto criado'); onFechar() },
    onError: toast.erro,
  })
  const e = f.formState.errors
  return (
    <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código *" erro={e.codigo?.message}>{(id) => <Input id={id} aria-invalid={!!e.codigo} {...f.register('codigo')} />}</Field>
        <Field label="Unidade *" erro={e.unidade?.message}>
          {(id) => (
            <Select id={id} aria-invalid={!!e.unidade} {...f.register('unidade')}>
              <option value="">Selecione…</option>
              {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Nome *" erro={e.nome?.message}>{(id) => <Input id={id} aria-invalid={!!e.nome} {...f.register('nome')} />}</Field>
      <Field label="Apelidos (separados por vírgula)" erro={e.apelidos?.message}>
        {(id) => <Input id={id} placeholder="ex.: arroz, arroz branco" {...f.register('apelidos')} />}
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button type="submit" loading={m.isPending}>Salvar</Button>
      </div>
    </form>
  )
}

export function ProdutosPage() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null)
  const [inativando, setInativando] = useState<Produto | null>(null)
  const b = useDebounce(busca)
  const q = useQuery({ queryKey: ['produtos', b, page], queryFn: () => api.produtos.listar({ busca: b, page }), placeholderData: keepPreviousData })
  const inativar = useMutation({
    mutationFn: (id: string) => api.produtos.inativar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos'] }); toast.ok('Produto inativado'); setInativando(null) },
    onError: toast.erro,
  })
  return (
    <>
      <PageHeader titulo="Produtos" acoes={<Button onClick={() => setEditando('novo')}>Novo produto</Button>} />
      <Input placeholder="Buscar por nome, código ou apelido…" aria-label="Buscar produtos" value={busca}
        onChange={(e) => { setBusca(e.target.value); setPage(1) }} className="mb-4 max-w-sm" />
      <QueryState q={q} vazio={(d) => d.total === 0 && (
        <EmptyState titulo={b ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
          acao={<Button onClick={() => setEditando('novo')}>Cadastrar produto</Button>} />)}>
        {(d) => (
          <>
            <Table head={['Código', 'Nome', 'Unidade', 'Apelidos', 'Situação', '']}>
              {d.items.map((p) => (
                <tr key={p.id} className={p.ativo ? '' : 'opacity-60'}>
                  <Td className="font-mono text-xs">{p.codigo}</Td>
                  <Td className="font-medium">{p.nome}</Td>
                  <Td><Badge>{p.unidade}</Badge></Td>
                  <Td><div className="flex flex-wrap gap-1">{p.apelidos.length ? p.apelidos.map((a) => <Badge key={a} tom="azul">{a}</Badge>) : <span className="text-muted">—</span>}</div></Td>
                  <Td>{p.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditando(p)}>Editar</Button>
                      {p.ativo && usuario?.papel === 'admin' && <Button variant="ghost" onClick={() => setInativando(p)}>Inativar</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <Modal titulo={editando === 'novo' ? 'Novo produto' : 'Editar produto'} aberto={!!editando} onClose={() => setEditando(null)}>
        {editando && <ProdutoForm inicial={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Modal>
      <ConfirmDialog aberto={!!inativando} titulo="Inativar produto" confirmar="Inativar" enviando={inativar.isPending}
        mensagem={`"${inativando?.nome}" não poderá ser usado em novos pedidos.`}
        onCancel={() => setInativando(null)} onConfirm={() => inativando && inativar.mutate(inativando.id)} />
    </>
  )
}

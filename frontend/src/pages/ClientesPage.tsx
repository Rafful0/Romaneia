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
import { api } from '../services/api'
import type { Cliente, ClienteIn } from '../types'

const opc = z.string().trim().max(500).transform((v) => v || null)
const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(200), documento: opc, telefone: opc, endereco: opc,
  tipo_comercio_id: z.string().transform((v) => v || null),
})
type FormIn = z.input<typeof schema>

function ClienteForm({ inicial, onSalvo, onCancel }: { inicial?: Cliente; onSalvo: () => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const f = useForm<FormIn, unknown, ClienteIn>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: inicial?.nome ?? '', documento: inicial?.documento ?? '', telefone: inicial?.telefone ?? '', endereco: inicial?.endereco ?? '',
      tipo_comercio_id: inicial?.tipo_comercio_id ?? '',
    },
  })
  // shortcut: até 100 tipos ativos no <select>; suficiente para classificação de clientes.
  const tipos = useQuery({ queryKey: ['tipos-comercio', 'ativos'], queryFn: () => api.tiposComercio.listar({ ativo: true, page_size: 100 }) })
  const tipoAtualInativo = inicial?.tipo_comercio_id && tipos.data && !tipos.data.items.some((t) => t.id === inicial.tipo_comercio_id)
  const m = useMutation({
    mutationFn: (d: ClienteIn) => (inicial ? api.clientes.editar(inicial.id, d) : api.clientes.criar(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.ok(inicial ? 'Cliente atualizado' : 'Cliente criado'); onSalvo() },
    onError: toast.erro,
  })
  const e = f.formState.errors
  return (
    <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-3">
      <Field label="Nome *" erro={e.nome?.message}>{(id) => <Input id={id} aria-invalid={!!e.nome} {...f.register('nome')} />}</Field>
      <Field label="Tipo de comércio" erro={tipos.isError ? 'Não foi possível carregar os tipos' : undefined}>
        {(id) => (
          <Select id={id} disabled={tipos.isPending} {...f.register('tipo_comercio_id')}>
            <option value="">Sem tipo</option>
            {tipoAtualInativo && <option value={inicial!.tipo_comercio_id!}>{inicial!.tipo_comercio_nome} (inativo)</option>}
            {tipos.data?.items.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        )}
      </Field>
      <Field label="CPF/CNPJ">{(id) => <Input id={id} {...f.register('documento')} />}</Field>
      <Field label="Telefone">{(id) => <Input id={id} {...f.register('telefone')} />}</Field>
      <Field label="Endereço">{(id) => <Input id={id} {...f.register('endereco')} />}</Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={m.isPending}>Salvar</Button>
      </div>
    </form>
  )
}

export function ClientesPage() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null)
  const [inativando, setInativando] = useState<Cliente | null>(null)
  const b = useDebounce(busca)
  const q = useQuery({ queryKey: ['clientes', b, page], queryFn: () => api.clientes.listar({ busca: b, page }), placeholderData: keepPreviousData })
  const inativar = useMutation({
    mutationFn: (id: string) => api.clientes.inativar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.ok('Cliente inativado'); setInativando(null) },
    onError: toast.erro,
  })
  const admin = usuario?.papel === 'admin'
  return (
    <>
      <PageHeader titulo="Clientes" acoes={<Button onClick={() => setEditando('novo')}>Novo cliente</Button>} />
      <Input placeholder="Buscar por nome ou documento…" aria-label="Buscar clientes" value={busca}
        onChange={(e) => { setBusca(e.target.value); setPage(1) }} className="mb-4 max-w-sm" />
      <QueryState q={q} vazio={(d) => d.total === 0 && (
        <EmptyState titulo={b ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
          acao={<Button onClick={() => setEditando('novo')}>Cadastrar cliente</Button>} />)}>
        {(d) => (
          <>
            <Table head={['Nome', 'Tipo', 'Documento', 'Telefone', 'Situação', '']}>
              {d.items.map((c) => (
                <tr key={c.id} className={c.ativo ? '' : 'text-muted'}>
                  <Td className="font-medium">{c.nome}</Td>
                  <Td className="text-muted">{c.tipo_comercio_nome ?? '—'}</Td>
                  <Td className="text-muted">{c.documento ?? '—'}</Td>
                  <Td className="text-muted">{c.telefone ?? '—'}</Td>
                  <Td>{c.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditando(c)}>Editar</Button>
                      {c.ativo && admin && <Button variant="ghost" onClick={() => setInativando(c)}>Inativar</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <Modal titulo={editando === 'novo' ? 'Novo cliente' : 'Editar cliente'} aberto={!!editando} onClose={() => setEditando(null)}>
        {editando && <ClienteForm inicial={editando === 'novo' ? undefined : editando} onSalvo={() => setEditando(null)} onCancel={() => setEditando(null)} />}
      </Modal>
      <ConfirmDialog aberto={!!inativando} titulo="Inativar cliente" confirmar="Inativar" enviando={inativar.isPending}
        mensagem={`"${inativando?.nome}" não poderá receber novos pedidos. Pedidos existentes não são alterados.`}
        onCancel={() => setInativando(null)} onConfirm={() => inativando && inativar.mutate(inativando.id)} />
    </>
  )
}

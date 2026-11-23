import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Pagination, QueryState, Table, Td, Textarea } from '../components/ui'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { useAuth } from '../hooks/useAuth'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import { formatarTelefone, telefoneWhatsApp } from '../lib/whatsapp'
import { api } from '../services/api'
import type { Fornecedor, FornecedorIn } from '../types'

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(200),
  telefone: z.string().trim().refine((t) => !!telefoneWhatsApp(t), 'Número inválido: use DDD + número (ex.: 11 98765-4321)'),
  observacao: z.string().trim().max(500).transform((v) => v || null),
})
type FormIn = z.input<typeof schema>

function FornecedorForm({ inicial, onFechar }: { inicial?: Fornecedor; onFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const f = useForm<FormIn, unknown, FornecedorIn>({
    resolver: zodResolver(schema),
    defaultValues: { nome: inicial?.nome ?? '', telefone: inicial ? formatarTelefone(inicial.telefone) : '', observacao: inicial?.observacao ?? '' },
  })
  const m = useMutation({
    mutationFn: (d: FornecedorIn) => (inicial ? api.fornecedores.editar(inicial.id, d) : api.fornecedores.criar(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fornecedores'] }); toast.ok(inicial ? 'Fornecedor atualizado' : 'Fornecedor cadastrado'); onFechar() },
    onError: toast.erro,
  })
  const e = f.formState.errors
  return (
    <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-3">
      <Field label="Nome *" erro={e.nome?.message}>{(id) => <Input id={id} aria-invalid={!!e.nome} {...f.register('nome')} />}</Field>
      <Field label="Número do WhatsApp *" erro={e.telefone?.message}>
        {(id) => <Input id={id} type="tel" inputMode="tel" placeholder="(11) 98765-4321" aria-invalid={!!e.telefone} {...f.register('telefone')} />}
      </Field>
      <Field label="Observação">{(id) => <Textarea id={id} rows={2} placeholder="ex.: o que fornece, melhor horário" {...f.register('observacao')} />}</Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button type="submit" loading={m.isPending}>Salvar</Button>
      </div>
    </form>
  )
}

export function FornecedoresPage() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [editando, setEditando] = useState<Fornecedor | 'novo' | null>(null)
  const [inativando, setInativando] = useState<Fornecedor | null>(null)
  const b = useDebounce(busca)
  const q = useQuery({ queryKey: ['fornecedores', b, page], queryFn: () => api.fornecedores.listar({ busca: b, page }), placeholderData: keepPreviousData })
  const inativar = useMutation({
    mutationFn: (id: string) => api.fornecedores.inativar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fornecedores'] }); toast.ok('Fornecedor inativado'); setInativando(null) },
    onError: toast.erro,
  })
  const novo = <Button onClick={() => setEditando('novo')}>Novo fornecedor</Button>
  return (
    <>
      <PageHeader titulo="Fornecedores" sub="Números de WhatsApp de quem fornece para você." acoes={novo} />
      <Input placeholder="Buscar por nome ou número…" aria-label="Buscar fornecedores" value={busca}
        onChange={(e) => { setBusca(e.target.value); setPage(1) }} className="mb-4 max-w-sm" />
      <QueryState q={q} vazio={(d) => d.total === 0 && (
        <EmptyState titulo={b ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
          acao={<Button onClick={() => setEditando('novo')}>Cadastrar fornecedor</Button>} />)}>
        {(d) => (
          <>
            <Table head={['Nome', 'WhatsApp', 'Observação', 'Situação', '']}>
              {d.items.map((f) => (
                <tr key={f.id} className={f.ativo ? '' : 'text-muted'}>
                  <Td className="font-medium">{f.nome}</Td>
                  <Td>
                    <a href={`https://wa.me/${f.telefone}`} target="_blank" rel="noopener noreferrer"
                      aria-label={`Abrir conversa com ${f.nome} no WhatsApp`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-brand">
                      <WhatsAppIcon className="size-3.5 text-whatsapp" />{formatarTelefone(f.telefone)}
                    </a>
                  </Td>
                  <Td className="max-w-xs truncate text-muted">{f.observacao ?? '—'}</Td>
                  <Td>{f.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setEditando(f)}>Editar</Button>
                      {f.ativo && usuario?.papel === 'admin' && <Button variant="ghost" onClick={() => setInativando(f)}>Inativar</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <Modal titulo={editando === 'novo' ? 'Novo fornecedor' : 'Editar fornecedor'} aberto={!!editando} onClose={() => setEditando(null)}>
        {editando && <FornecedorForm inicial={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Modal>
      <ConfirmDialog aberto={!!inativando} titulo="Inativar fornecedor" confirmar="Inativar" enviando={inativar.isPending}
        mensagem={`"${inativando?.nome}" sai da lista de fornecedores ativos. O cadastro fica guardado.`}
        onCancel={() => setInativando(null)} onConfirm={() => inativando && inativar.mutate(inativando.id)} />
    </>
  )
}

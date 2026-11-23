import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button, ButtonLink, Field, Input, Spinner } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { AuthLayout } from '../layouts/AuthLayout'
import { api } from '../services/api'

const schema = z.object({ empresa: z.string().trim().min(1, 'Informe o nome da empresa').max(200) })
type Form = z.infer<typeof schema>

/** Volta do Google com uma conta nova: falta só o nome da empresa. */
export function CadastroGooglePage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const q = useQuery({ queryKey: ['cadastro-google'], queryFn: api.auth.cadastroGoogle, retry: false })
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { empresa: '' } })
  const m = useMutation({
    mutationFn: (d: Form) => api.auth.cadastroGoogleConcluir(d.empresa),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u)
      toast.ok(`Conta criada. Bem-vindo(a), ${u.nome}!`)
      nav('/', { replace: true })
    },
  })
  return (
    <AuthLayout>
      {q.isPending && <div className="flex justify-center py-6"><Spinner /></div>}
      {q.isError && (
        <>
          <p role="alert" className="rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{q.error.message}</p>
          <ButtonLink to="/cadastro" variant="secondary">Voltar ao cadastro</ButtonLink>
        </>
      )}
      {q.data && (
        <form noValidate onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Quase lá, {q.data.nome.split(' ')[0]}</h1>
            <p className="text-sm text-ink-2">Conta Google <strong className="text-ink">{q.data.email}</strong>. Falta só o nome da sua empresa.</p>
          </div>
          <Field label="Nome da empresa" erro={f.formState.errors.empresa?.message}>
            {(id) => <Input id={id} autoComplete="organization" aria-invalid={!!f.formState.errors.empresa} {...f.register('empresa')} />}
          </Field>
          {m.isError && <p role="alert" className="rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{m.error.message}</p>}
          <Button type="submit" loading={m.isPending}>Criar conta</Button>
        </form>
      )}
    </AuthLayout>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { BotaoGoogle } from '../components/BotaoGoogle'
import { Button, Field, Input } from '../components/ui'
import { WhatsAppIcon } from '../components/WhatsAppIcon'
import { AuthLayout } from '../layouts/AuthLayout'
import { api } from '../services/api'

const schema = z.object({
  login: z.string().trim().min(1, 'Informe o e-mail ou celular'),
  senha: z.string().min(1, 'Informe a senha'),
})
type Form = z.infer<typeof schema>

export function LoginPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const [sp] = useSearchParams()
  const provedores = useQuery({ queryKey: ['provedores'], queryFn: api.auth.provedores, staleTime: Infinity, retry: false })
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { login: '', senha: '' } })
  const m = useMutation({
    mutationFn: (d: Form) => api.auth.login(d.login, d.senha),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u)
      nav((loc.state as { de?: string } | null)?.de ?? '/', { replace: true })
    },
  })
  const e = f.formState.errors
  return (
    <AuthLayout>
      <form noValidate onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-4">
        <div className="mb-1 flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Entrar no Romaneia</h1>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <WhatsAppIcon className="size-4 shrink-0 text-whatsapp" />
            Pedidos com envio pelo WhatsApp
          </p>
        </div>
        {sp.get('erro')?.startsWith('google') && !m.isError && (
          <p role="alert" className="rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {sp.get('erro') === 'google_conta_existente'
              ? 'Já existe uma conta com este e-mail. Entre com e-mail e senha.'
              : 'Não foi possível entrar com o Google. Tente de novo.'}
          </p>
        )}
        <Field label="E-mail ou celular" erro={e.login?.message}>
          {(id) => <Input id={id} autoComplete="username" placeholder="voce@empresa.com ou (11) 98765-4321"
            aria-invalid={!!e.login} {...f.register('login')} />}
        </Field>
        <Field label="Senha" erro={e.senha?.message}>
          {(id) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={!!e.senha} {...f.register('senha')} />}
        </Field>
        {m.isError && <p role="alert" className="rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{m.error.message}</p>}
        <Button type="submit" loading={m.isPending}>Entrar</Button>
      </form>
      {provedores.data?.google && <BotaoGoogle texto="Entrar com Google" />}
      <p className="text-center text-sm text-ink-2">
        Ainda não tem conta? <Link to="/cadastro" className="font-medium text-brand hover:underline">Criar conta</Link>
      </p>
    </AuthLayout>
  )
}

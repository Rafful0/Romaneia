import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { BotaoGoogle } from '../components/BotaoGoogle'
import { Button, Field, Input } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { formatarTelefone, telefoneWhatsApp } from '../lib/whatsapp'
import { AuthLayout } from '../layouts/AuthLayout'
import { api } from '../services/api'
import type { CadastroIn, CadastroIniciado } from '../types'

export const cadastroSchema = z.object({
  metodo: z.enum(['email', 'telefone']),
  destino: z.string().trim().min(1, 'Preencha este campo'),
  nome: z.string().trim().min(1, 'Informe seu nome').max(200),
  empresa: z.string().trim().min(1, 'Informe o nome da empresa').max(200),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(200),
  confirmar: z.string(),
}).superRefine((d, ctx) => {
  if (d.metodo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.destino)) {
    ctx.addIssue({ code: 'custom', path: ['destino'], message: 'E-mail inválido' })
  }
  if (d.metodo === 'telefone' && !telefoneWhatsApp(d.destino)) {
    ctx.addIssue({ code: 'custom', path: ['destino'], message: 'Celular inválido: use DDD + número (ex.: 11 98765-4321)' })
  }
  if (d.confirmar !== d.senha) ctx.addIssue({ code: 'custom', path: ['confirmar'], message: 'As senhas não conferem' })
})
type Dados = z.infer<typeof cadastroSchema>
const codigoSchema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 dígitos') })

const alerta = 'rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger'

export function CadastroPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const [enviado, setEnviado] = useState<{ dados: CadastroIn; resp: CadastroIniciado } | null>(null)
  const provedores = useQuery({ queryKey: ['provedores'], queryFn: api.auth.provedores, staleTime: Infinity, retry: false })

  const f = useForm<Dados>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { metodo: 'email', destino: '', nome: '', empresa: '', senha: '', confirmar: '' },
  })
  const metodo = f.watch('metodo')
  const iniciar = useMutation({
    mutationFn: (d: CadastroIn) => api.auth.cadastroIniciar(d),
    onSuccess: (resp, dados) => {
      if (enviado) toast.ok('Enviamos um novo código')
      setEnviado({ dados, resp })
    },
  })
  const fc = useForm<z.infer<typeof codigoSchema>>({ resolver: zodResolver(codigoSchema), defaultValues: { codigo: '' } })
  const confirmar = useMutation({
    mutationFn: (codigo: string) => api.auth.cadastroConfirmar(enviado!.resp.cadastro_id, codigo),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u)
      toast.ok(`Conta criada. Bem-vindo(a), ${u.nome}!`)
      nav('/', { replace: true })
    },
  })

  if (enviado) {
    const { dados, resp } = enviado
    const destino = resp.metodo === 'email' ? resp.destino : formatarTelefone(resp.destino)
    return (
      <AuthLayout>
        <form noValidate onSubmit={fc.handleSubmit((d) => confirmar.mutate(d.codigo))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Confirme seu {resp.metodo === 'email' ? 'e-mail' : 'celular'}</h1>
            <p className="text-sm text-ink-2">Digite o código de 6 dígitos enviado para <strong className="text-ink">{destino}</strong>.</p>
          </div>
          {resp.codigo_dev && (
            <p role="status" className="rounded border-l-2 border-warn bg-warn/10 px-3 py-2 text-sm text-ink-2">
              Modo protótipo: nada foi enviado de verdade. Seu código é{' '}
              <strong className="font-mono text-base tracking-widest text-ink" data-testid="codigo-dev">{resp.codigo_dev}</strong>.
            </p>
          )}
          <Field label="Código" erro={fc.formState.errors.codigo?.message}>
            {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className="font-mono text-lg tracking-[0.4em]" aria-invalid={!!fc.formState.errors.codigo} {...fc.register('codigo')} />}
          </Field>
          {confirmar.isError && <p role="alert" className={alerta}>{confirmar.error.message}</p>}
          <Button type="submit" loading={confirmar.isPending}>Confirmar e criar conta</Button>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => { confirmar.reset(); fc.reset(); setEnviado(null) }}>Voltar</Button>
            <Button type="button" variant="ghost" loading={iniciar.isPending}
              onClick={() => { confirmar.reset(); fc.reset(); iniciar.mutate(dados) }}>Reenviar código</Button>
          </div>
          {iniciar.isError && <p role="alert" className={alerta}>{iniciar.error.message}</p>}
        </form>
      </AuthLayout>
    )
  }

  const e = f.formState.errors
  const opcao = (valor: Dados['metodo'], rotulo: string) => (
    <label className={'flex flex-1 cursor-pointer items-center justify-center rounded px-3 py-1.5 text-sm transition-colors ' +
      'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ' +
      (metodo === valor ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:text-ink')}>
      <input type="radio" value={valor} className="sr-only" {...f.register('metodo', { onChange: () => f.clearErrors('destino') })} />
      {rotulo}
    </label>
  )
  return (
    <AuthLayout>
      <form noValidate onSubmit={f.handleSubmit(({ confirmar: _, ...d }) => iniciar.mutate(d))} className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Criar conta</h1>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-ink-2">Cadastrar com</legend>
          <div className="flex gap-1 rounded-md border border-white/15 bg-black/20 p-1">
            {opcao('email', 'E-mail')}
            {opcao('telefone', 'Celular')}
          </div>
        </fieldset>
        <Field label="Seu nome" erro={e.nome?.message}>
          {(id) => <Input id={id} autoComplete="name" aria-invalid={!!e.nome} {...f.register('nome')} />}
        </Field>
        <Field label="Nome da empresa" erro={e.empresa?.message}>
          {(id) => <Input id={id} autoComplete="organization" aria-invalid={!!e.empresa} {...f.register('empresa')} />}
        </Field>
        <Field label={metodo === 'email' ? 'E-mail' : 'Celular (com DDD)'} erro={e.destino?.message}>
          {(id) => <Input id={id} type={metodo === 'email' ? 'email' : 'tel'} inputMode={metodo === 'email' ? 'email' : 'tel'}
            autoComplete={metodo === 'email' ? 'email' : 'tel'} placeholder={metodo === 'email' ? 'voce@empresa.com' : '(11) 98765-4321'}
            aria-invalid={!!e.destino} {...f.register('destino')} />}
        </Field>
        <Field label="Senha (mín. 8 caracteres)" erro={e.senha?.message}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={!!e.senha} {...f.register('senha')} />}
        </Field>
        <Field label="Confirmar senha" erro={e.confirmar?.message}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={!!e.confirmar} {...f.register('confirmar')} />}
        </Field>
        {iniciar.isError && <p role="alert" className={alerta}>{iniciar.error.message}</p>}
        <Button type="submit" loading={iniciar.isPending}>Continuar</Button>
      </form>
      {provedores.data?.google && <BotaoGoogle texto="Cadastrar com Google" />}
      <p className="text-center text-sm text-ink-2">
        Já tem conta? <Link to="/login" className="font-medium text-brand hover:underline">Entrar</Link>
      </p>
    </AuthLayout>
  )
}

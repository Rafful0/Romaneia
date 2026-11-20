// Única camada HTTP do app. Nenhum componente chama fetch diretamente.
import type {
  Atividade, Cliente, ClienteIn, Dashboard, Pagina, Pedido, PedidoIn, PedidoResumo, Produto, ProdutoIn,
  Romaneio, RomaneioResumo, Rota, RotaResumo, Usuario, UsuarioResumo,
} from '../types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
export const EVENTO_401 = 'romaneia:nao-autenticado'

export class ApiError extends Error {
  constructor(public status: number, public codigo: string, message: string, public detalhes?: unknown) {
    super(message)
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

async function req<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ''
  let r: Response
  try {
    r = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'rede', 'Não foi possível falar com o servidor. Verifique a conexão.')
  }
  if (r.status === 204) return undefined as T
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const e = data?.erro
    if (r.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event(EVENTO_401))
    throw new ApiError(r.status, e?.codigo ?? 'erro', e?.mensagem ?? `Erro ${r.status}`, e?.detalhes)
  }
  return data as T
}

const get = <T>(p: string, params?: Params) => req<T>('GET', p, undefined, params)
const post = <T>(p: string, body?: unknown) => req<T>('POST', p, body ?? {})
const put = <T>(p: string, body: unknown) => req<T>('PUT', p, body)
const del = <T>(p: string) => req<T>('DELETE', p)

export const api = {
  auth: {
    login: (email: string, senha: string) => post<Usuario>('/auth/login', { email, senha }),
    logout: () => post<void>('/auth/logout'),
    me: () => get<Usuario>('/auth/me'),
  },
  dashboard: () => get<Dashboard>('/dashboard'),
  usuarios: () => get<UsuarioResumo[]>('/usuarios'),
  auditoria: (p: Params) => get<Pagina<Atividade>>('/auditoria', p),
  clientes: {
    listar: (p: Params) => get<Pagina<Cliente>>('/clientes', p),
    criar: (d: ClienteIn) => post<Cliente>('/clientes', d),
    editar: (id: string, d: ClienteIn) => put<Cliente>(`/clientes/${id}`, d),
    inativar: (id: string) => post<Cliente>(`/clientes/${id}/inativar`),
  },
  produtos: {
    listar: (p: Params) => get<Pagina<Produto>>('/produtos', p),
    criar: (d: ProdutoIn) => post<Produto>('/produtos', d),
    editar: (id: string, d: ProdutoIn) => put<Produto>(`/produtos/${id}`, d),
    inativar: (id: string) => post<Produto>(`/produtos/${id}/inativar`),
  },
  pedidos: {
    listar: (p: Params) => get<Pagina<PedidoResumo>>('/pedidos', p),
    obter: (id: string) => get<Pedido>(`/pedidos/${id}`),
    criar: (d: PedidoIn) => post<Pedido>('/pedidos', d),
    editar: (id: string, d: PedidoIn) => put<Pedido>(`/pedidos/${id}`, d),
    confirmar: (id: string) => post<Pedido>(`/pedidos/${id}/confirmar`),
    cancelar: (id: string, motivo: string) => post<Pedido>(`/pedidos/${id}/cancelar`, { motivo }),
  },
  rotas: {
    listar: (p: Params) => get<Pagina<RotaResumo>>('/rotas', p),
    obter: (id: string) => get<Rota>(`/rotas/${id}`),
    criar: (d: { nome: string; data: string; observacao: string | null }) => post<Rota>('/rotas', d),
    associar: (id: string, pedido_id: string) => post<Rota>(`/rotas/${id}/pedidos`, { pedido_id }),
    remover: (id: string, pedidoId: string) => del<Rota>(`/rotas/${id}/pedidos/${pedidoId}`),
    gerarRomaneio: (id: string) => post<Romaneio>(`/rotas/${id}/romaneios`),
  },
  romaneios: {
    listar: (p: Params) => get<Pagina<RomaneioResumo>>('/romaneios', p),
    obter: (id: string) => get<Romaneio>(`/romaneios/${id}`),
    separar: (id: string, itemId: string, separado: boolean, versao: number) =>
      post<Romaneio>(`/romaneios/${id}/itens/${itemId}/separacao`, { separado, versao }),
  },
}

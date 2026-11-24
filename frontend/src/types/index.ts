export type Papel = 'admin' | 'operador'
export type Unidade = 'un' | 'cx' | 'pct' | 'dz' | 'fd' | 'kg' | 'g' | 'l' | 'ml'
export type StatusPedido = 'pendente' | 'confirmado' | 'em_separacao' | 'separado' | 'cancelado'
export type StatusRomaneio = 'ativo' | 'desatualizado' | 'substituido' | 'concluido'

export interface Pagina<T> { items: T[]; total: number; page: number; page_size: number }

export interface Usuario { id: string; nome: string; papel: Papel; empresa: string }
export interface UsuarioResumo { id: string; nome: string; papel: Papel; ativo: boolean }

export interface Produto {
  id: string; codigo: string; nome: string; unidade: Unidade; ativo: boolean; apelidos: string[]
  criado_em: string; atualizado_em: string
}
export type ProdutoIn = Pick<Produto, 'codigo' | 'nome' | 'unidade' | 'apelidos'>

export interface ItemPedido {
  id: string; posicao: number; produto_id: string | null; produto_codigo: string | null
  produto_nome: string | null; texto_original: string | null; quantidade: string; unidade: Unidade
}
export interface PedidoResumo {
  id: string; numero: number; fornecedor_id: string; fornecedor_nome: string; fornecedor_telefone: string | null; rota_id: string | null
  rota_nome: string | null; rota_data: string | null; data_entrega: string; status: StatusPedido
  observacao: string | null; motivo_cancelamento: string | null; revisao: number; criado_em: string
  atualizado_em: string; criado_por_nome: string; qtd_itens: number; nao_identificados: number
}
export type StatusEnvio = 'pendente' | 'enviando' | 'enviado' | 'entregue' | 'lido' | 'falhou'
export interface EnvioWhatsApp {
  id: string; motivo: 'pedido' | 'cancelamento'; status: StatusEnvio; tipo_mensagem: 'texto' | 'modelo' | null
  telefone: string; erro: string | null; criado_em: string; atualizado_em: string
}
export interface Pedido extends PedidoResumo { itens: ItemPedido[]; envios_whatsapp: EnvioWhatsApp[] }
export interface ItemIn { produto_id: string | null; texto_original: string | null; quantidade: string; unidade: Unidade }
export interface PedidoIn { fornecedor_id: string; data_entrega: string; observacao: string | null; itens: ItemIn[] }

export interface RomaneioRef { id: string; versao: number; status: StatusRomaneio; gerado_em?: string }
export interface RotaResumo {
  id: string; nome: string; data: string; observacao: string | null; criado_em: string
  total_pedidos: number; confirmados: number; romaneio_atual: RomaneioRef | null
}
export interface PedidoNaRota {
  id: string; numero: number; fornecedor_nome: string; status: StatusPedido; data_entrega: string
  qtd_itens: number; nao_identificados: number
}
export interface Rota extends RotaResumo { pedidos: PedidoNaRota[]; romaneios: RomaneioRef[] }

export interface RomaneioItem {
  id: string; produto_id: string; produto_codigo: string; produto_nome: string; unidade: Unidade
  quantidade_total: string; separado_em: string | null; separado_por_nome: string | null; versao: number
  origens: { pedido_numero: number; fornecedor_nome: string; quantidade: string }[]
}
export interface RomaneioResumo {
  id: string; rota_id: string; rota_nome: string; rota_data: string; versao: number; status: StatusRomaneio
  gerado_em: string; total_itens: number; separados: number; total_pedidos: number
}
export interface Romaneio {
  id: string; rota_id: string; rota_nome: string; rota_data: string; versao: number; status: StatusRomaneio
  motivo_desatualizado: string | null; gerado_em: string; gerado_por_nome: string; concluido_em: string | null
  progresso: { total: number; separados: number; percentual: number }
  itens: RomaneioItem[]
  por_fornecedor: { fornecedor_id: string; fornecedor_nome: string; pedidos: number[];
    itens: { produto_codigo: string; produto_nome: string; unidade: Unidade; quantidade: string }[] }[]
  pedidos: { id: string; numero: number; fornecedor_nome: string; status: StatusPedido; pedido_revisao: number; revisao_atual: number }[]
  pendentes_ignorados?: number
}

export interface Atividade {
  id: number; criado_em: string; acao: string; entidade: string; entidade_id: string | null
  detalhes: Record<string, unknown>; usuario_id: string | null; usuario_nome: string | null
}
export interface Dashboard {
  pendentes: number; confirmados: number; em_separacao: number; sem_rota: number; atividade_recente: Atividade[]
}

export interface Provedores { google: boolean; verificacao_simulada: boolean }
export type MetodoCadastro = 'email' | 'telefone'
export interface CadastroIn { metodo: MetodoCadastro; destino: string; nome: string; empresa: string; senha: string }
export interface CadastroIniciado {
  cadastro_id: string; metodo: MetodoCadastro; destino: string; expira_em: string
  codigo_dev?: string // só no modo protótipo: o código não é enviado de verdade
}

export interface Fornecedor {
  id: string; nome: string; telefone: string; observacao: string | null; ativo: boolean
  criado_em: string; atualizado_em: string
}
export interface FornecedorIn { nome: string; telefone: string; observacao: string | null }

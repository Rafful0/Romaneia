import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorState, Spinner } from './components/ui'
import { useAuth } from './hooks/useAuth'
import { AppLayout } from './layouts/AppLayout'
import { ClientesPage } from './pages/ClientesPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoricoPage } from './pages/HistoricoPage'
import { LoginPage } from './pages/LoginPage'
import { PedidoDetalhePage } from './pages/PedidoDetalhePage'
import { PedidoFormPage } from './pages/PedidoFormPage'
import { PedidosPage } from './pages/PedidosPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { RomaneioDetalhePage } from './pages/RomaneioDetalhePage'
import { RomaneiosPage } from './pages/RomaneiosPage'
import { RotaDetalhePage } from './pages/RotaDetalhePage'
import { RotasPage } from './pages/RotasPage'
import { SeparacaoPage } from './pages/SeparacaoPage'
import { TipoComercioLeituraPage } from './pages/TipoComercioLeituraPage'
import { TiposComercioPage } from './pages/TiposComercioPage'

function Privado() {
  const { usuario, carregando, naoAutenticado, erro, refetch } = useAuth()
  const loc = useLocation()
  if (carregando) return <div className="grid h-full place-items-center"><Spinner /></div>
  if (erro) return <div className="p-10"><ErrorState erro={erro} onRetry={() => refetch()} /></div>
  if (naoAutenticado || !usuario) return <Navigate to="/login" replace state={{ de: loc.pathname + loc.search }} />
  return <AppLayout usuario={usuario} />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Privado />}>
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="tipos-comercio" element={<TiposComercioPage />} />
        <Route path="tipos-comercio/:id" element={<TipoComercioLeituraPage />} />
        <Route path="produtos" element={<ProdutosPage />} />
        <Route path="pedidos" element={<PedidosPage />} />
        <Route path="pedidos/novo" element={<PedidoFormPage />} />
        <Route path="pedidos/:id" element={<PedidoDetalhePage />} />
        <Route path="pedidos/:id/editar" element={<PedidoFormPage />} />
        <Route path="rotas" element={<RotasPage />} />
        <Route path="rotas/:id" element={<RotaDetalhePage />} />
        <Route path="romaneios" element={<RomaneiosPage />} />
        <Route path="romaneios/:id" element={<RomaneioDetalhePage />} />
        <Route path="romaneios/:id/separacao" element={<SeparacaoPage />} />
        <Route path="historico" element={<HistoricoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

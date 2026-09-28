import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RequirePermission } from './routes/RequirePermission';
import { LoginPage } from './pages/LoginPage';
import { Skeleton } from './components/ui/Skeleton';

// ponytail: code-splitting por página em vez de por biblioteca — mecânico
// (import -> lazy import) e reduz o bundle inicial sem tocar em manualChunks.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('./pages/RolesPage').then((m) => ({ default: m.RolesPage })));
const AuditPage = lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const ClientesPage = lazy(() => import('./pages/ClientesPage').then((m) => ({ default: m.ClientesPage })));
const MotoristasLayout = lazy(() => import('./pages/motoristas/MotoristasLayout').then((m) => ({ default: m.MotoristasLayout })));
const DriversListPage = lazy(() => import('./pages/motoristas/DriversListPage').then((m) => ({ default: m.DriversListPage })));
const DriverApprovalPage = lazy(() => import('./pages/motoristas/DriverApprovalPage').then((m) => ({ default: m.DriverApprovalPage })));
const DriversBlockedPage = lazy(() => import('./pages/motoristas/DriversBlockedPage').then((m) => ({ default: m.DriversBlockedPage })));
const CorridasPage = lazy(() => import('./pages/corridas/CorridasPage').then((m) => ({ default: m.CorridasPage })));
const PlanejamentoPage = lazy(() => import('./pages/corridas/PlanejamentoPage').then((m) => ({ default: m.PlanejamentoPage })));
const MapaOperacionalPage = lazy(() => import('./pages/mapa/MapaOperacionalPage').then((m) => ({ default: m.MapaOperacionalPage })));
const TarifasLayout = lazy(() => import('./pages/tarifas/TarifasLayout').then((m) => ({ default: m.TarifasLayout })));
const ConfiguracaoTab = lazy(() => import('./pages/tarifas/ConfiguracaoTab').then((m) => ({ default: m.ConfiguracaoTab })));
const HorariosTab = lazy(() => import('./pages/tarifas/HorariosTab').then((m) => ({ default: m.HorariosTab })));
const SimuladorTab = lazy(() => import('./pages/tarifas/SimuladorTab').then((m) => ({ default: m.SimuladorTab })));
const ZonasPage = lazy(() => import('./pages/zonas/ZonasPage').then((m) => ({ default: m.ZonasPage })));
const CouponsPage = lazy(() => import('./pages/coupons/CouponsPage').then((m) => ({ default: m.CouponsPage })));
const FinanceiroPage = lazy(() => import('./pages/financeiro/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })));
const ConfiguracoesLayout = lazy(() => import('./pages/configuracoes/ConfiguracoesLayout').then((m) => ({ default: m.ConfiguracoesLayout })));
const MarcaPage = lazy(() => import('./pages/desenvolvedor/MarcaPage').then((m) => ({ default: m.MarcaPage })));
const SistemaTab = lazy(() => import('./pages/configuracoes/SistemaTab').then((m) => ({ default: m.SistemaTab })));
const DespachoTab = lazy(() => import('./pages/configuracoes/DespachoTab').then((m) => ({ default: m.DespachoTab })));
const NotificacoesTab = lazy(() => import('./pages/configuracoes/NotificacoesTab').then((m) => ({ default: m.NotificacoesTab })));
const IntegracoesTab = lazy(() => import('./pages/configuracoes/IntegracoesTab').then((m) => ({ default: m.IntegracoesTab })));

function PageFallback() {
  return (
    <div className="p-8">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route
              index
              element={
                <RequirePermission permission="dashboard.visualizar">
                  <DashboardPage />
                </RequirePermission>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequirePermission permission="usuarios.visualizar">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="/cargos"
              element={
                <RequirePermission permission="usuarios.visualizar">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/auditoria"
              element={
                <RequirePermission permission="auditoria.visualizar">
                  <AuditPage />
                </RequirePermission>
              }
            />
            <Route
              path="/clientes"
              element={
                <RequirePermission permission="clientes.visualizar">
                  <ClientesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/motoristas"
              element={
                <RequirePermission permission="motoristas.visualizar">
                  <MotoristasLayout />
                </RequirePermission>
              }
            >
              <Route index element={<DriversListPage />} />
              <Route
                path="aprovacao"
                element={
                  <RequirePermission permission="motoristas.aprovar">
                    <DriverApprovalPage />
                  </RequirePermission>
                }
              />
              <Route
                path="bloqueados"
                element={
                  <RequirePermission permission="motoristas.bloquear">
                    <DriversBlockedPage />
                  </RequirePermission>
                }
              />
            </Route>
            <Route
              path="/corridas"
              element={
                <RequirePermission permission="corridas.visualizar">
                  <CorridasPage />
                </RequirePermission>
              }
            />
            <Route
              path="/planejamento"
              element={
                <RequirePermission permission="corridas.visualizar">
                  <PlanejamentoPage />
                </RequirePermission>
              }
            />
            <Route
              path="/mapa"
              element={
                <RequirePermission permission="mapa.visualizar">
                  <MapaOperacionalPage />
                </RequirePermission>
              }
            />
            <Route
              path="/tarifas"
              element={
                <RequirePermission permission="tarifas.visualizar">
                  <TarifasLayout />
                </RequirePermission>
              }
            >
              <Route index element={<ConfiguracaoTab />} />
              <Route path="horarios" element={<HorariosTab />} />
              <Route path="simulador" element={<SimuladorTab />} />
            </Route>
            <Route
              path="/zonas"
              element={
                <RequirePermission permission="zonas.visualizar">
                  <ZonasPage />
                </RequirePermission>
              }
            />
            <Route
              path="/cupons"
              element={
                <RequirePermission permission="cupons.visualizar">
                  <CouponsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/financeiro"
              element={
                <RequirePermission permission="financeiro.visualizar">
                  <FinanceiroPage />
                </RequirePermission>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <RequirePermission permission="configuracoes.visualizar">
                  <ConfiguracoesLayout />
                </RequirePermission>
              }
            >
              <Route index element={<SistemaTab />} />
              <Route path="despacho" element={<DespachoTab />} />
              <Route path="notificacoes" element={<NotificacoesTab />} />
              <Route path="integracoes" element={<IntegracoesTab />} />
            </Route>
            <Route
              path="/desenvolvedor/marca"
              element={
                <RequirePermission permission="desenvolvedor.marca">
                  <MarcaPage />
                </RequirePermission>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

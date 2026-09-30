import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/Auth';
import { DadosProvider } from '@/context/Dados';
import { ConfirmProvider, PaginaEsqueleto, ToastProvider } from '@/components/ui';
import Layout from '@/components/Layout';
import BaterPonto from '@/pages/BaterPonto';
import Login from '@/pages/Login';
import Diagnostico from '@/pages/Diagnostico';
import Verificar from '@/pages/Verificar';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Gerencia = lazy(() => import('@/pages/Gerencia'));
const Funcionarios = lazy(() => import('@/pages/Funcionarios'));
const Cargos = lazy(() => import('@/pages/Cargos'));
const Escalas = lazy(() => import('@/pages/Escalas'));
const Registros = lazy(() => import('@/pages/Registros'));
const Ocorrencias = lazy(() => import('@/pages/Ocorrencias'));
const Feriados = lazy(() => import('@/pages/Feriados'));
const Folha = lazy(() => import('@/pages/Folha'));
const Relatorios = lazy(() => import('@/pages/Relatorios'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));

function Protegido({ papeis, children }: { papeis?: ('admin' | 'gerente')[]; children: React.ReactNode }) {
  const { sessao, carregando } = useAuth();
  if (carregando) return null;
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (papeis && !papeis.includes(sessao.papel)) return <Navigate to="/painel" replace />;
  return <>{children}</>;
}

function Inicio() {
  const { sessao } = useAuth();
  return sessao?.papel === 'admin' ? <Dashboard /> : <Navigate to="/painel/gerencia" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/" element={<BaterPonto />} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/diagnostico" element={<Diagnostico />} />
            <Route path="/verificar" element={<Verificar />} />
            <Route path="/verificar/:codigo" element={<Verificar />} />
            <Route path="/painel" element={<Protegido><DadosProvider><Layout /></DadosProvider></Protegido>}>
              <Route index element={<Suspense fallback={<PaginaEsqueleto />}><Inicio /></Suspense>} />
              <Route path="gerencia" element={<Suspense fallback={<PaginaEsqueleto />}><Gerencia /></Suspense>} />
              <Route path="funcionarios" element={<Protegido papeis={['admin']}><Suspense fallback={<PaginaEsqueleto />}><Funcionarios /></Suspense></Protegido>} />
              <Route path="cargos" element={<Protegido papeis={['admin']}><Suspense fallback={<PaginaEsqueleto />}><Cargos /></Suspense></Protegido>} />
              <Route path="escalas" element={<Suspense fallback={<PaginaEsqueleto />}><Escalas /></Suspense>} />
              <Route path="ponto" element={<Suspense fallback={<PaginaEsqueleto />}><Registros /></Suspense>} />
              <Route path="ocorrencias" element={<Suspense fallback={<PaginaEsqueleto />}><Ocorrencias /></Suspense>} />
              <Route path="feriados" element={<Suspense fallback={<PaginaEsqueleto />}><Feriados /></Suspense>} />
              <Route path="folha" element={<Protegido papeis={['admin']}><Suspense fallback={<PaginaEsqueleto />}><Folha /></Suspense></Protegido>} />
              <Route path="relatorios" element={<Suspense fallback={<PaginaEsqueleto />}><Relatorios /></Suspense>} />
              <Route path="configuracoes" element={<Protegido papeis={['admin']}><Suspense fallback={<PaginaEsqueleto />}><Configuracoes /></Suspense></Protegido>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

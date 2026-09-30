import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/Auth';
import { DadosProvider } from '@/context/Dados';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import Layout from '@/components/Layout';
import BaterPonto from '@/pages/BaterPonto';
import Login from '@/pages/Login';

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
            <Route path="/painel" element={<Protegido><DadosProvider><Layout /></DadosProvider></Protegido>}>
              <Route index element={<Suspense fallback={null}><Inicio /></Suspense>} />
              <Route path="gerencia" element={<Suspense fallback={null}><Gerencia /></Suspense>} />
              <Route path="funcionarios" element={<Protegido papeis={['admin']}><Suspense fallback={null}><Funcionarios /></Suspense></Protegido>} />
              <Route path="cargos" element={<Protegido papeis={['admin']}><Suspense fallback={null}><Cargos /></Suspense></Protegido>} />
              <Route path="escalas" element={<Suspense fallback={null}><Escalas /></Suspense>} />
              <Route path="ponto" element={<Suspense fallback={null}><Registros /></Suspense>} />
              <Route path="ocorrencias" element={<Suspense fallback={null}><Ocorrencias /></Suspense>} />
              <Route path="feriados" element={<Suspense fallback={null}><Feriados /></Suspense>} />
              <Route path="folha" element={<Protegido papeis={['admin']}><Suspense fallback={null}><Folha /></Suspense></Protegido>} />
              <Route path="relatorios" element={<Suspense fallback={null}><Relatorios /></Suspense>} />
              <Route path="configuracoes" element={<Protegido papeis={['admin']}><Suspense fallback={null}><Configuracoes /></Suspense></Protegido>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

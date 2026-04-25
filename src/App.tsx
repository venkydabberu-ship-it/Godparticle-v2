import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

const Landing      = lazy(() => import('./pages/Landing'));
const Login        = lazy(() => import('./pages/Login'));
const Signup       = lazy(() => import('./pages/Signup'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Analysis     = lazy(() => import('./pages/Analysis'));
const Pricing      = lazy(() => import('./pages/Pricing'));
const Admin        = lazy(() => import('./pages/Admin'));
const ZeroToHero   = lazy(() => import('./pages/ZeroToHero'));
const StockAnalysis = lazy(() => import('./pages/StockAnalysis'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 bg-[#f0c040] rounded-xl flex items-center justify-center text-xl animate-pulse">⚛</div>
      <div className="text-[#f0c040] text-sm font-mono">Loading…</div>
    </div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <Loader />;
  if (!profile || profile.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={
              <PublicRoute><Login /></PublicRoute>
            } />
            <Route path="/signup" element={
              <PublicRoute><Signup /></PublicRoute>
            } />
            <Route path="/forgot-password" element={
              <PublicRoute><ForgotPassword /></PublicRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/analysis" element={
              <ProtectedRoute><Analysis /></ProtectedRoute>
            } />
            <Route path="/pricing" element={
              <ProtectedRoute><Pricing /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <AdminRoute><Admin /></AdminRoute>
              </ProtectedRoute>
            } />
            <Route path="/zero-to-hero" element={
              <ProtectedRoute><ZeroToHero /></ProtectedRoute>
            } />
            <Route path="/stock-analysis" element={
              <ProtectedRoute><StockAnalysis /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

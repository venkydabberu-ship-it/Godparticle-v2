import { lazy, Suspense, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  constructor(props: any) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="w-12 h-12 bg-[#ff4d6d] rounded-xl flex items-center justify-center text-xl">⚠</div>
            <div className="text-[#e8e8f0] font-black text-lg">Something went wrong</div>
            <div className="text-[#6b6b85] font-mono text-sm">A new version may have been deployed.</div>
            <button onClick={() => window.location.reload()}
              className="bg-[#f0c040] text-[#0a0a0f] font-black px-6 py-3 rounded-xl text-sm">
              Tap to Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Landing      = lazy(() => import('./pages/Landing'));
const Login        = lazy(() => import('./pages/Login'));
const Signup       = lazy(() => import('./pages/Signup'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Analysis     = lazy(() => import('./pages/Analysis'));
const Pricing      = lazy(() => import('./pages/Pricing'));
const Admin        = lazy(() => import('./pages/Admin'));
const ZeroToHero   = lazy(() => import('./pages/ZeroToHero'));
const StockAnalysis = lazy(() => import('./pages/StockAnalysis'));
const Trending        = lazy(() => import('./pages/Trending'));
const SectorRotation  = lazy(() => import('./pages/SectorRotation'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Terms        = lazy(() => import('./pages/Terms'));
const Privacy      = lazy(() => import('./pages/Privacy'));
const Refund       = lazy(() => import('./pages/Refund'));

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 bg-[#f0c040] rounded-xl flex items-center justify-center text-xl animate-pulse">⚛</div>
      <div className="text-[#f0c040] text-sm font-mono">Loading…</div>
    </div>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  // Only block on loading if we have no cached profile to show
  if (loading && !profile) return <Loader />;
  // Auth settled with no user or profile → go to login
  if (!loading && !user && !profile) return <Navigate to="/login" replace />;
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
        <ErrorBoundary>
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
            <Route path="/trending" element={
              <ProtectedRoute><Trending /></ProtectedRoute>
            } />
            <Route path="/sector-rotation" element={
              <ProtectedRoute><SectorRotation /></ProtectedRoute>
            } />
            <Route path="/terms"   element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/refund"  element={<Refund />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

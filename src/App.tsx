import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import Pricing from './pages/Pricing';
import Admin from './pages/Admin';
import ZeroToHero from './pages/ZeroToHero';
import StockAnalysis from './pages/StockAnalysis';
import ForgotPassword from './pages/ForgotPassword';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-[#f0c040] text-xl font-mono">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-[#f0c040] text-xl font-mono">Loading...</div>
    </div>
  );
  if (!profile || profile.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-[#f0c040] text-xl font-mono">Loading...</div>
    </div>
  );
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

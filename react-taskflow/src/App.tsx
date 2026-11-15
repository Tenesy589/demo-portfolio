import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/store/auth';

// Route-level code splitting: each page is its own chunk.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const BoardsPage = lazy(() => import('@/pages/BoardsPage'));
const BoardPage = lazy(() => import('@/pages/BoardPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  return useAuth((s) => s.token) ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="grid min-h-dvh place-items-center text-slate-400">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<BoardsPage />} />
            <Route path="boards/:id" element={<BoardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

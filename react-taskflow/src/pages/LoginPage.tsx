import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { User } from '@/types';

export default function LoginPage() {
  const { token, setSession } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: 'demo@liveboard.dev', password: 'demo1234' });

  const auth = useMutation({
    mutationFn: () => api<{ accessToken: string; user: User }>(`/auth/${mode}`, { method: 'POST', json: mode === 'login' ? { email: form.email, password: form.password } : form }),
    onSuccess: ({ accessToken, user }) => setSession(accessToken, user),
  });

  if (token) return <Navigate to="/" replace />;
  const submit = (e: FormEvent) => (e.preventDefault(), auth.mutate());

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-brand-500/20 via-transparent to-violet-500/20 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-brand-500 text-2xl text-white">✓</div>
          <h1 className="text-xl font-bold">{mode === 'login' ? 'Вход в TaskFlow' : 'Регистрация'}</h1>
          <p className="text-sm text-slate-500">Канбан-доска для команды: задачи обновляются у всех в реальном времени</p>
        </div>
        {mode === 'register' && <input className="input" placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />}
        <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="input" type="password" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        {auth.error && <p className="text-sm text-rose-600">{auth.error instanceof ApiError && auth.error.status === 401 ? 'Неверный email или пароль' : auth.error instanceof ApiError && auth.error.status === 409 ? 'Такой email уже зарегистрирован' : 'Не удалось войти, попробуйте ещё раз'}</p>}
        <button className="btn-primary w-full" disabled={auth.isPending}>{auth.isPending ? '…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <button type="button" className="btn-ghost w-full" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войти'}
        </button>
        <p className="text-center text-xs text-slate-500">Демо-доступ уже подставлен — просто нажмите «Войти».<br />Другие пользователи: alice@liveboard.dev, bob@liveboard.dev (пароль demo1234)</p>
      </form>
    </div>
  );
}

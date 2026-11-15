import React, { FormEvent, useState } from 'react';
import { login, register, bootstrapAdmin } from '../../services/authApi';
import { formatApiErrorMessage } from '../../utils/apiError';

export const AuthPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [mode, setMode] = useState(window.location.pathname === '/setup' ? 'setup' : window.location.pathname === '/register' ? 'register' : 'login');
  const [form, setForm] = useState({username: '', email: '', full_name: '', password: '', bootstrap_token: ''});
  const [error, setError] = useState(new URLSearchParams(location.search).has('expired') ? 'Your session expired. Please sign in again.' : '');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'register') await register(form);
      if (mode === 'setup') await bootstrapAdmin(form);
      await login(form.username.trim(), form.password);
      history.replaceState(null, '', '/'); onLogin();
    } catch (e) { setError(formatApiErrorMessage(e, 'Unable to sign in or create the account.')); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
    <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl text-white">
      <p className="text-sm font-semibold tracking-widest text-cyan-400">AttedDEL</p>
      <h1 className="my-3 text-3xl font-bold">{mode === 'login' ? 'Welcome back' : mode === 'setup' ? 'First administrator' : 'Create student account'}</h1>
      <p className="mb-6 text-sm text-slate-400">{mode === 'setup' ? 'Available only until the first administrator exists. Production requires a bootstrap token.' : 'Your attendance workspace, from enrollment to reports.'}</p>
      <form onSubmit={submit} className="space-y-4">
        {(['username', ...(mode !== 'login' ? ['full_name', 'email'] : []), 'password', ...(mode === 'setup' ? ['bootstrap_token'] : [])] as (keyof typeof form)[]).map(key => <label key={key} className="block text-sm capitalize">{key.replace('_', ' ')}
          <input className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 focus:ring-2 focus:ring-cyan-400" type={key === 'password' || key === 'bootstrap_token' ? 'password' : key === 'email' ? 'email' : 'text'} required={key !== 'bootstrap_token'} minLength={key === 'password' && mode !== 'login' ? 8 : undefined} autoComplete={key === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : key === 'username' ? 'username' : undefined} value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}/>
        </label>)}
        {mode !== 'login' && <p className="text-xs text-slate-400">Password: at least 8 characters including a letter and a digit. Student accounts are linked to academic records by an administrator.</p>}
        {error && <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-cyan-400 p-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <nav className="mt-5 flex justify-between text-sm text-cyan-300">{['login', 'register', 'setup'].filter(x => x !== mode).map(x => <button key={x} onClick={() => {setMode(x); setError(''); history.replaceState(null, '', `/${x}`);}}>{x === 'login' ? 'Sign in' : x === 'register' ? 'Register' : 'First-time setup'}</button>)}</nav>
    </section>
  </main>;
};

import React, { FormEvent, useState } from 'react';
import { Eye, EyeOff, GraduationCap } from 'lucide-react';
import { login, register, bootstrapAdmin } from '../../services/authApi';
import { formatApiErrorMessage } from '../../utils/apiError';
import { Button } from '../ui';

export const AuthPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [mode, setMode] = useState(window.location.pathname === '/setup' ? 'setup' : window.location.pathname === '/register' ? 'register' : 'login');
  const [form, setForm] = useState({username: '', email: '', full_name: '', password: '', bootstrap_token: ''});
  const [error, setError] = useState(new URLSearchParams(location.search).has('expired') ? 'Your session expired. Please sign in again.' : '');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const strength = [form.password.length >= 8, /[a-z]/i.test(form.password), /\d/.test(form.password)].filter(Boolean).length;
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
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-text">
    <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 sm:p-9">
      <div className="mb-8 flex items-center gap-3 border-b border-border pb-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap size={21} aria-hidden="true"/>
        </span>
        <span className="font-semibold tracking-tight">AttedDEL</span>
      </div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : mode === 'setup' ? 'First administrator' : 'Create your account'}</h1>
      {mode === 'setup' && <p className="mb-5 text-sm text-text-muted">Production setup requires a bootstrap token.</p>}
      <form onSubmit={submit} className="space-y-5">
        {(['username', ...(mode !== 'login' ? ['full_name', 'email'] : []), 'password', ...(mode === 'setup' ? ['bootstrap_token'] : [])] as (keyof typeof form)[]).map(key => <div key={key}><label htmlFor={`auth-${key}`} className="mb-2 block text-sm font-medium capitalize">{key.replace('_', ' ')}{key === 'bootstrap_token' && <span className="ml-1 text-xs font-normal text-text-muted">if required</span>}</label><div className="relative">
          <input id={`auth-${key}`} className={`min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${key === 'password' ? 'pr-14' : ''}`} type={key === 'password' ? (showPassword ? 'text' : 'password') : key === 'bootstrap_token' ? 'password' : key === 'email' ? 'email' : 'text'} required={key !== 'bootstrap_token'} minLength={key === 'password' && mode !== 'login' ? 8 : undefined} autoComplete={key === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : key === 'username' ? 'username' : key === 'email' ? 'email' : key === 'full_name' ? 'name' : 'off'} value={form[key]} disabled={busy} onChange={e => setForm({...form, [key]: e.target.value})}/>
          {key === 'password' && <button type="button" className="absolute inset-y-0 right-0 w-12 text-text-muted" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="mx-auto" size={18}/> : <Eye className="mx-auto" size={18}/>}</button>}
        </div></div>)}
        {mode !== 'login' && <div><div className="mb-2 flex gap-1" aria-label={`Password requirements: ${strength} of 3 met`}>{[1,2,3].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${strength >= i ? 'bg-primary' : 'bg-surface-muted'}`}/>)}</div><p className="text-xs leading-5 text-text-muted">Use at least 8 characters, including a letter and a digit.</p></div>}
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <Button disabled={busy} type="submit" className="w-full min-h-12">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <nav aria-label="Account options" className="mt-7 flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-sm">{['login', 'register', 'setup'].filter(x => x !== mode).map(x => <button key={x} className="min-h-11 font-medium text-primary" onClick={() => {setMode(x); setError(''); history.replaceState(null, '', `/${x}`);}}>{x === 'login' ? 'Sign in' : x === 'register' ? 'Create student account' : 'First-time setup'}</button>)}</nav>
    </section>
  </main>;
};

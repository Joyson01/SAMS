import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchHealthStatus } from '../services/api';
import { ServiceHealthResponse } from '../types';
import { Button, Skeleton } from './ui';
export function SystemHealthCard() {
 const [health,setHealth]=useState<ServiceHealthResponse|null>(null);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{try {setHealth(await fetchHealthStatus());setError('');}catch {setError('Unable to reach the backend. Check your connection and try again.');}},[]);
 useEffect(()=>{void load();const timer=setInterval(load,30000);return()=>clearInterval(timer);},[load]);
 return <section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-primary"/>System health</h2><span className="text-xs text-text-muted">Updates every 30s</span></div>{error?<div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-danger"><p>{error}</p><Button size="sm" variant="secondary" onClick={()=>void load()} icon={<RefreshCw size={15}/>}>Retry</Button></div>:!health?<div className="grid gap-4 sm:grid-cols-4">{[0,1,2,3].map(i=><Skeleton key={i} className="h-14"/>)}</div>:<div className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><p className="mb-2 text-xs text-text-muted">AI engine</p><strong className={`flex items-start gap-2 ${health.ai?.status==='ready'?'text-success':'text-warning'}`}>{health.ai?.status==='ready'?<CheckCircle2 size={16} className="shrink-0"/>:<AlertCircle size={16} className="shrink-0"/>}{health.ai?.message||'Not loaded'}</strong></div><div><p className="mb-2 text-xs text-text-muted">Recognition gallery</p><strong>{health.ai?.gallery_size??0} students</strong></div><div><p className="mb-2 text-xs text-text-muted">Database</p><strong>{health.database.status} · {health.database.latency_ms} ms</strong></div><div><p className="mb-2 text-xs text-text-muted">Inference provider</p><strong className="break-words">{health.ai?.providers.join(', ')||'Unavailable'}</strong></div></div>}</section>;
}

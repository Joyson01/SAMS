import { useEffect, useState } from 'react';
import { fetchHealthStatus } from '../services/api';
import { ServiceHealthResponse } from '../types';
export function SystemHealthCard(){
 const [health,setHealth]=useState<ServiceHealthResponse|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;const load=()=>fetchHealthStatus().then(h=>{if(active){setHealth(h);setError('');}}).catch(()=>{if(active)setError('Unable to reach the backend. Check that it is running.');});void load();const t=setInterval(load,30000);return()=>{active=false;clearInterval(t);};},[]);
 return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">System Health</h2>{error?<p role="alert" className="text-red-700">{error}</p>:!health?<p className="animate-pulse text-slate-500">Checking components…</p>:<div className="mt-3 grid gap-3 text-sm sm:grid-cols-4"><div><p className="text-slate-500">AI engine</p><strong className={health.ai?.status==='ready'?'text-green-700':'text-amber-700'}>{health.ai?.message||'Not loaded'}</strong></div><div><p className="text-slate-500">Recognition gallery</p><strong>{health.ai?.gallery_size??0} students</strong></div><div><p className="text-slate-500">Database</p><strong>{health.database.status} · {health.database.latency_ms} ms</strong></div><div><p className="text-slate-500">Inference provider</p><strong>{health.ai?.providers.join(', ')||'Unavailable'}</strong></div></div>}</section>;
}

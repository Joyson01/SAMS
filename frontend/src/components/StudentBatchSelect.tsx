import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
export function StudentBatchSelect({className,value,onChange}:{className:string;value?:string|null;onChange:(value:string|null)=>void}) {
  const [batches,setBatches]=useState<{id:string;name:string}[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{let live=true;setBatches([]);setError('');apiClient.get<{id:string;name:string}[]>('/media-attendance/image/batches',{params:{class_name:className}}).then(r=>{if(live)setBatches(r.data);}).catch(()=>{if(live)setError('Could not load batches.');});return()=>{live=false;};},[className]);
  return <label className="block text-sm">Lab batch<select className="block border rounded p-2 w-full" value={value || ''} onChange={e=>onChange(e.target.value || null)}><option value="">Unassigned</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>{error && <span role="alert">{error}</span>}</label>;
}

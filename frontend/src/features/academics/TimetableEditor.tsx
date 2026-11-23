import { useDialogFeedback } from '../../components/common/useDialogFeedback';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

type Named={id:string;name:string};
type Slot={id:string;day_of_week:string;start_time:string;end_time:string;label:string;subject_id:string|null;batch_id:string|null;room:string|null};
const empty={day_of_week:'Monday',start_time:'09:00',end_time:'10:00',label:'',subject_id:'',batch_id:'',room:''};
export function TimetableEditor(){
  const { confirmAction, feedback } = useDialogFeedback();
 const [busy,setBusy]=useState(false);
 const [classes,setClasses]=useState<Named[]>([]),[subjects,setSubjects]=useState<Named[]>([]),[batches,setBatches]=useState<Named[]>([]),[slots,setSlots]=useState<Slot[]>([]),[cid,setCid]=useState(''),[form,setForm]=useState(empty),[editing,setEditing]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const drafts = useRef(new Map<string, { form: typeof empty; editing: string }>());
 const activeClass = useRef('');
 const version = useRef(0);
 const [reload,setReload]=useState(0);
 const [catalogError,setCatalogError]=useState('');
 const [loading,setLoading]=useState(false);
 const load = async () => {
   const request = ++version.current;
   if (!cid) return;
   setLoading(true);
   try {
     const [s,b] = await Promise.all([apiClient.get(`/classes/${cid}/timetable`),apiClient.get(`/classes/${cid}/batches`)]);
     if (request !== version.current || cid !== activeClass.current) return;
     setSlots(s.data);
     setBatches(b.data);
   } finally {
     if (request === version.current && cid === activeClass.current) setLoading(false);
   }
 };
 const selectClass = (next: string) => {
   drafts.current.set(cid,{ form, editing });
   const draft = drafts.current.get(next);
   activeClass.current = next;
   ++version.current;
   setCid(next);
   setForm(draft?.form ?? empty);
   setEditing(draft?.editing ?? '');
   setSlots([]);
   setBatches([]);
   setPage(0);
   setError('');
   setNotice('');
 };
 useEffect(() => {
   let active = true;
   setCatalogError('');
   Promise.all([apiClient.get('/classes'),apiClient.get('/subjects')]).then(([c,s]) => {
     if (!active) return;
     setClasses(c.data); setSubjects(s.data);
     if (!activeClass.current) {
       activeClass.current = c.data[0]?.id || '';
       setCid(activeClass.current);
     }
   }).catch(e => { if(active) setCatalogError(formatApiErrorMessage(e,'Unable to load timetable.')); });
   return () => { active = false; };
 }, [reload]);
 useEffect(() => {
   let active = true;
   void load().catch(e => { if (active) setError(formatApiErrorMessage(e,'Unable to load slots.')); });
   return () => { active = false; };
 }, [cid]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{setError('');await fn();await load();setNotice('Timetable saved.');window.dispatchEvent(new Event('timetable-updated'));}catch(e){setError(formatApiErrorMessage(e,'Unable to save timetable.'));}finally{setBusy(false);}};
 const rows=slots.filter(s=>`${s.day_of_week} ${s.label} ${s.room}`.toLowerCase().includes(search.toLowerCase()));
 return <section className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5">{feedback}<h2 className="text-xl font-semibold">Manage timetable slots</h2>{catalogError&&<p role="alert">{catalogError} <button onClick={()=>setReload(value=>value+1)}>Retry</button></p>}{error&&<p role="alert" className="text-danger">{error} <button className="underline" onClick={()=>void load().catch(e=>setError(formatApiErrorMessage(e,'Unable to reload.')))}>Retry</button></p>}{notice&&<p role="status" className="text-success">{notice}</p>}<label>Class<select className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" disabled={busy} value={cid} onChange={e=>selectClass(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{cid&&<><form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();if(form.end_time<=form.start_time){setError('End time must be after start time.');return;}void run(async()=>{const payload={...form,class_id:cid,subject_id:form.subject_id||null,batch_id:form.batch_id||null};if(editing)await apiClient.put(`/classes/timetable/entries/${editing}`,payload);else await apiClient.post(`/classes/${cid}/timetable`,{...payload,entry_type:form.subject_id?'SUBJECT':'ACTIVITY'});setEditing('');setForm(empty);});}}><label>Day<select className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" value={form.day_of_week} onChange={e=>setForm({...form,day_of_week:e.target.value})}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=><option key={d}>{d}</option>)}</select></label>{(['start_time','end_time','label','room'] as const).map(k=><label key={k} className="capitalize">{k.replace('_',' ')}<input required={k!=='room'} className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" type={k.endsWith('time')?'time':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label>Subject<select className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" value={form.subject_id} onChange={e=>setForm({...form,subject_id:e.target.value})}><option value="">No subject / activity</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Lab batch<select className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" value={form.batch_id} onChange={e=>setForm({...form,batch_id:e.target.value})}><option value="">Whole class</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button disabled={busy} className="rounded-lg bg-primary disabled:opacity-50 p-2 text-white">{editing?'Save changes':'Create slot'}</button></form><label>Search slots<input className="mt-1 block w-full rounded-lg border border-border bg-surface p-2" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Day</th><th>Time</th><th>Label</th><th>Actions</th></tr></thead><tbody>{rows.slice(page*10,page*10+10).map(s=><tr key={s.id} className="border-t"><td className="py-3">{s.day_of_week}</td><td>{s.start_time}–{s.end_time}</td><td>{s.label}</td><td className="space-x-3"><button onClick={()=>{setEditing(s.id);setForm({day_of_week:s.day_of_week,start_time:s.start_time,end_time:s.end_time,label:s.label,subject_id:s.subject_id||'',batch_id:s.batch_id||'',room:s.room||''});}}>Edit</button><button className="text-danger" onClick={async()=>{if(await confirmAction('Delete this timetable slot?'))void run(()=>apiClient.delete(`/classes/timetable/entries/${s.id}`));}}>Delete</button></td></tr>)}</tbody></table></div>{loading ? <p>Loading slots…</p> : !rows.length && !error && <p>No timetable slots found.</p>}<div className="flex flex-wrap items-end gap-3"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1}</span><button disabled={(page+1)*10>=rows.length} onClick={()=>setPage(page+1)}>Next</button></div></>}</section>;
}

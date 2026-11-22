import { useCallback, useEffect, useState } from 'react';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { apiClient } from '../../services/api';
import { AuthUser } from '../../services/authApi';
import { formatApiErrorMessage } from '../../utils/apiError';
import { Avatar, Button, Modal, EmptyState, Skeleton, StatusBadge } from '../../components/ui';

export function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false), [selected, setSelected] = useState('');
  const [toggleUser, setToggleUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState({username:'',email:'',full_name:'',password:'',role:'FACULTY'});
  const [password, setPassword] = useState(''), [roll, setRoll] = useState(''), [code, setCode] = useState('');
  const load = useCallback(async () => {setLoading(true);try{setUsers((await apiClient.get<AuthUser[]>('/auth/users')).data);setError('');}catch(e){setError(formatApiErrorMessage(e,'Unable to load users.'));}finally{setLoading(false);}},[]);
  const run = async (action: () => Promise<unknown>) => {setBusy(true);setError('');setNotice('');try{await action();await load();setNotice('Changes saved successfully.');}catch(e){setError(formatApiErrorMessage(e,'Unable to save.'));}finally{setBusy(false);}};
  useEffect(() => {void load();},[load]);
  const filtered = users.filter(u => `${u.username} ${u.email} ${u.full_name}`.toLowerCase().includes(search.toLowerCase()));
  const selectedUser = users.find(u=>u.id===selected);
  const feedback = <>{error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}{notice && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}</>;
  const inputClass='mt-2 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-text';
  return <div className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Users</h1><p className="mt-1 text-sm text-text-muted">Manage campus accounts, access and student records.</p></div><Button icon={<Plus size={17}/>} onClick={()=>{setCreating(true);setError('');}}>Create account</Button></header>
    {feedback}
    <section className="rounded-xl border border-border bg-surface"><div className="flex items-center gap-3 border-b border-border p-4"><label className="flex-1"><span className="sr-only">Search users</span><input placeholder="Search by name, username or email" className={inputClass+' !mt-0'} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><Button variant="secondary" icon={<RefreshCw size={16}/>} disabled={loading} onClick={()=>void load()}>Refresh</Button></div>
    {loading?<div className="space-y-3 p-5">{[0,1,2].map(i=><Skeleton key={i} className="h-16"/>)}</div>:!filtered.length?<EmptyState icon={<Users size={24}/>} title={error?'Users unavailable':'No users found'} description={error?'Try reloading the directory.':'Try another search or create an account.'} actionLabel={error?'Retry':'Create account'} onAction={()=>error?void load():setCreating(true)}/>:<div className="divide-y divide-border">{filtered.slice(page*10,page*10+10).map(u=><article key={u.id} className="flex flex-wrap items-center gap-4 p-4 hover:bg-surface-muted/60"><Avatar name={u.full_name || u.username} size="lg"/><div className="min-w-[180px] flex-1"><h2 className="font-medium">{u.full_name || u.username}</h2><p className="break-all text-xs text-text-muted">{u.username} · {u.email}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{u.role}</span><span className={`text-xs font-medium ${u.is_active?'text-success':'text-text-muted'}`}>{u.is_active?'Active':'Disabled'}</span><div className="flex w-full gap-2 sm:w-auto"><Button size="sm" variant="secondary" onClick={()=>{setSelected(u.id);setError('');setNotice('');}}>Manage</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setToggleUser(u)}>{u.is_active?'Deactivate':'Activate'}</Button></div></article>)}</div>}
    <div className="flex items-center justify-between gap-3 border-t border-border p-4"><Button size="sm" variant="secondary" disabled={!page} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-xs text-text-muted">Page {page+1} · {filtered.length} users</span><Button size="sm" variant="secondary" disabled={(page+1)*10>=filtered.length} onClick={()=>setPage(page+1)}>Next</Button></div></section>
    <Modal isOpen={creating} onClose={()=>!busy&&setCreating(false)} title="Create campus account"><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await apiClient.post('/auth/users',form);setForm({...form,password:''});setCreating(false);});}}>{error&&<p role="alert" className="text-sm text-danger">{error}</p>}{(['username','full_name','email','password'] as const).map(k=><label key={k} className="block text-sm font-medium capitalize">{k.replace('_',' ')}<input className={inputClass} required minLength={k==='password'?8:undefined} type={k==='password'?'password':k==='email'?'email':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label className="block text-sm font-medium">Role<select className={inputClass} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{['FACULTY','OPERATOR','ADMIN','STUDENT'].map(r=><option key={r}>{r}</option>)}</select></label><Button type="submit" disabled={busy} className="w-full">{busy?'Creating…':'Create account'}</Button></form></Modal>
    <Modal isOpen={!!selected} onClose={()=>!busy&&setSelected('')} title={`Manage ${selectedUser?.username || 'account'}`}><div className="space-y-6">{feedback}<form onSubmit={e=>{e.preventDefault();void run(async()=>{await apiClient.patch(`/auth/users/${selected}`,{password});setPassword('');});}} className="space-y-3"><label className="block text-sm font-medium">New password<input required minLength={8} type="password" className={inputClass} value={password} onChange={e=>setPassword(e.target.value)}/></label><Button type="submit" disabled={busy}>Reset password</Button></form>{selectedUser?.role==='STUDENT'&&<form className="space-y-3 border-t border-border pt-5" onSubmit={e=>{e.preventDefault();void run(()=>apiClient.put(`/auth/users/${selected}/student`,{roll_number:roll,student_code:code}));}}><h3 className="font-semibold">Link a student record</h3><label className="block text-sm">Roll number<input required className={inputClass} value={roll} onChange={e=>setRoll(e.target.value)}/></label><label className="block text-sm">Student code<input required className={inputClass} value={code} onChange={e=>setCode(e.target.value)}/></label><Button type="submit" disabled={busy}>Link student</Button></form>}</div></Modal>
    <Modal isOpen={!!toggleUser} onClose={()=>!busy&&setToggleUser(null)} title={`${toggleUser?.is_active?'Deactivate':'Activate'} account?`} footer={<><Button variant="secondary" onClick={()=>setToggleUser(null)} disabled={busy}>Cancel</Button><Button variant={toggleUser?.is_active?'danger':'primary'} disabled={busy} onClick={()=>{if(toggleUser)void run(async()=>{await apiClient.patch(`/auth/users/${toggleUser.id}`,{is_active:!toggleUser.is_active});setToggleUser(null);});}}>Confirm</Button></>}><p className="text-sm text-text-muted">{toggleUser?.is_active?'This user will lose access to the workspace until their account is activated again.':'This user will regain access to the workspace.'}</p>{error&&<p role="alert" className="mt-3 text-danger">{error}</p>}</Modal>
  </div>;
}

type StudentProfile = {
  name: string;
  student_id: string;
  student_pid: string;
  roll_number: string;
  department: string;
  class_name: string;
  section: string;
  admission_academic_year: number | null;
  academic_year_range: string | null;
  branch: string | null;
  current_semester: number | null;
  email: string | null;
  mobile_number: string | null;
  discipline: string | null;
};

function StudentDetails({ profile }: { profile: StudentProfile }) {
  const fields = [
    ['Student PID', profile.student_pid],
    ['Admission Academic Year', profile.academic_year_range ?? profile.admission_academic_year],
    ['Branch', profile.branch],
    ['Current Semester', profile.current_semester === 6 ? 'VI' : profile.current_semester],
    ['Division', profile.section],
    ['Roll No', profile.roll_number],
    ['Name', profile.name],
    ['E-mail', profile.email],
    ['Mobile No', profile.mobile_number],
    ['Discipline', profile.discipline],
    ['Student User ID', profile.student_id],
    ['Class', profile.class_name],
    ['Department', profile.department],
  ];
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 font-semibold">My details</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="mt-1 break-words font-medium">{value ?? 'Not available'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type PersonalAttendance = {linked:boolean;profile?:StudentProfile;items:{id:string;date:string;subject:string;status:string;remarks:string}[]};
export function MyAttendancePage() {
 const [data,setData]=useState<PersonalAttendance|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{setData((await apiClient.get<PersonalAttendance>('/auth/my-attendance')).data);setError('');}catch(e){setError(formatApiErrorMessage(e,'Unable to load attendance.'));}},[]);
 useEffect(()=>{void load();},[load]);
 const items=data?.items||[];
 const present=items.filter(r=>['PRESENT','LATE','MANUAL_PRESENT'].includes(r.status)).length;
 const percent=items.length?Math.round(present/items.length*100):0;
 const subjects=Array.from(new Set(items.map(r=>r.subject)));
 return <div className="space-y-6"><header><h1 className="text-2xl font-semibold">My attendance</h1><p className="mt-1 text-sm text-text-muted">Your recorded sessions and subject attendance.</p></header>{!error && data?.profile && <StudentDetails profile={data.profile} />}{error?<EmptyState title="Attendance unavailable" description={error} actionLabel="Retry" onAction={()=>void load()}/>:!data?<Skeleton className="h-64"/>:!data.linked?<EmptyState title="Connect your student record" description="Ask your administrator to link your account using your roll number and student code."/>:!items.length?<EmptyState title="No attendance recorded yet" description="Your attendance history will appear after your first recorded session."/>:<><section className="grid gap-6 rounded-xl border border-border bg-surface p-6 sm:grid-cols-[auto_1fr]"><div className="relative mx-auto h-36 w-36"><svg viewBox="0 0 100 100" className="-rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-muted"/><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${percent*2.64} 264`} strokeLinecap="round" className="text-primary"/></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl">{percent}%</strong><span className="text-xs text-text-muted">Recorded presence</span></div></div><div className="space-y-4">{subjects.map(subject=>{const rows=items.filter(r=>r.subject===subject);const count=rows.filter(r=>['PRESENT','LATE','MANUAL_PRESENT'].includes(r.status)).length;return <div key={subject}><div className="mb-2 flex justify-between gap-3 text-sm"><span>{subject}</span><span className="text-text-muted">{count}/{rows.length}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary" style={{width:`${count/rows.length*100}%`}}/></div></div>;})}<p className="text-xs text-text-muted">Based on recorded sessions. Present, late and manual-present marks count as presence.</p></div></section><section className="rounded-xl border border-border bg-surface"><h2 className="border-b border-border p-5 font-semibold">Session history</h2><div className="divide-y divide-border">{items.map(r=><article key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h3 className="text-sm font-medium">{r.subject}</h3><p className="text-xs text-text-muted">{r.date}{r.remarks?` · ${r.remarks}`:''}</p></div><StatusBadge status={r.status} category="attendance"/></article>)}</div></section></>}</div>;
}

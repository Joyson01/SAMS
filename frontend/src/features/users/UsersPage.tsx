import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { AuthUser } from '../../services/authApi';
import { formatApiErrorMessage } from '../../utils/apiError';

export function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({username:'',email:'',full_name:'',password:'',role:'FACULTY'});
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [roll, setRoll] = useState('');
  const [code, setCode] = useState('');
  const load = async () => setUsers((await apiClient.get('/auth/users')).data);
  const run = async (action: () => Promise<unknown>) => { setError(''); setNotice(''); try {await action(); await load(); setNotice('Saved successfully.');} catch(e) {setError(formatApiErrorMessage(e, 'Unable to save.'));} };
  useEffect(() => {load().catch(e => setError(formatApiErrorMessage(e, 'Unable to load users.')));}, []);
  const filtered = users.filter(u => `${u.username} ${u.email} ${u.full_name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold">Users</h1><p className="text-slate-500">Create staff accounts, manage access and link student records.</p></header>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}{notice && <p role="status" className="rounded bg-green-50 p-3 text-green-800">{notice}</p>}
    <form className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2" onSubmit={e => {e.preventDefault(); void run(async () => {await apiClient.post('/auth/users',form); setForm({...form,password:''});});}}>
      <h2 className="font-semibold sm:col-span-2">Create account</h2>
      {(['username','full_name','email','password'] as const).map(k => <label key={k} className="text-sm capitalize">{k.replace('_',' ')}<input className="mt-1 w-full rounded border p-2" required type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'} value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})}/></label>)}
      <label className="text-sm">Role<select className="ml-2 rounded border p-2" value={form.role} onChange={e => setForm({...form,role:e.target.value})}>{['FACULTY','OPERATOR','ADMIN','STUDENT'].map(r => <option key={r}>{r}</option>)}</select></label><button className="rounded bg-blue-600 p-2 text-white">Create account</button>
    </form>
    <section className="overflow-x-auto rounded-xl border bg-white p-5"><label>Search users<input className="ml-3 rounded border p-2" value={search} onChange={e => {setSearch(e.target.value);setPage(0);}}/></label><table className="mt-4 w-full text-left text-sm"><thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Actions</th></tr></thead><tbody>{filtered.slice(page*10,page*10+10).map(u => <tr key={u.id} className="border-t"><td className="py-3">{u.full_name}<div className="text-xs text-slate-500">{u.username} · {u.email}</div></td><td>{u.role}</td><td>{u.is_active ? 'Active' : 'Disabled'}</td><td className="space-x-3"><button className="text-blue-700" onClick={() => setSelected(u.id)}>Manage</button><button className="text-red-700" onClick={() => void run(() => apiClient.patch(`/auth/users/${u.id}`,{is_active:!u.is_active}))}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table>{!filtered.length && <p>No users found.</p>}<div className="mt-3 flex gap-3"><button disabled={!page} onClick={() => setPage(page-1)}>Previous</button><span>Page {page+1}</span><button disabled={(page+1)*10>=filtered.length} onClick={() => setPage(page+1)}>Next</button></div></section>
    {selected && <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Manage {users.find(u => u.id === selected)?.username}</h2><form onSubmit={e => {e.preventDefault(); void run(async () => {await apiClient.patch(`/auth/users/${selected}`,{password});setPassword('');});}} className="flex gap-3"><label>New password<input required minLength={8} type="password" className="ml-2 rounded border p-2" value={password} onChange={e => setPassword(e.target.value)}/></label><button>Reset password</button></form>
    {users.find(u => u.id === selected)?.role === 'STUDENT' && <form className="flex flex-wrap gap-3" onSubmit={e => {e.preventDefault();void run(() => apiClient.put(`/auth/users/${selected}/student`,{roll_number:roll,student_code:code}));}}><label>Roll number<input required className="ml-2 rounded border p-2" value={roll} onChange={e => setRoll(e.target.value)}/></label><label>Student code<input required className="ml-2 rounded border p-2" value={code} onChange={e => setCode(e.target.value)}/></label><button>Link student</button></form>}</section>}
  </div>;
}

export function MyAttendancePage() {
  const [data,setData] = useState<{linked:boolean;items:{id:string;date:string;subject:string;status:string;remarks:string}[]} | null>(null);
  const [error,setError] = useState('');
  useEffect(() => {apiClient.get('/auth/my-attendance').then(r => setData(r.data)).catch(e => setError(formatApiErrorMessage(e,'Unable to load attendance.')));},[]);
  return <section className="rounded-xl border bg-white p-6"><h1 className="text-2xl font-bold">My Attendance</h1>{error && <p role="alert">{error}</p>}{!data && !error && <p>Loading…</p>}{data && !data.linked && <p className="mt-4">Ask your administrator to link your account using your roll number and student code.</p>}{data?.linked && <table className="mt-4 w-full text-left"><thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{data.items.map(r => <tr key={r.id} className="border-t"><td className="py-3">{r.date}</td><td>{r.subject}</td><td>{r.status}</td><td>{r.remarks}</td></tr>)}</tbody></table>}{data?.linked && !data.items.length && <p>No attendance recorded yet.</p>}</section>;
}

import { ArrowUpRight, BookOpen, CalendarDays, UsersRound } from 'lucide-react';
import { PeriodCalendar, type PeriodRecord } from './PeriodCalendar';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { apiClient } from '../../services/api';
import { CorrectionForm, FaceRequests, fieldClass, RequestState, StudentReviewQueue } from './StudentRequests';
import { TeacherClasses } from './TeacherClasses';
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
  const [form, setForm] = useState({username:'',email:'',full_name:'',password:'',role:'FACULTY',department:''});
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
    <StudentReviewQueue />
    <section className="rounded-xl border border-border bg-surface"><div className="flex items-center gap-3 border-b border-border p-4"><label className="flex-1"><span className="sr-only">Search users</span><input placeholder="Search by name, username or email" className={inputClass+' !mt-0'} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><Button variant="secondary" icon={<RefreshCw size={16}/>} disabled={loading} onClick={()=>void load()}>Refresh</Button></div>
    {loading?<div className="space-y-3 p-5">{[0,1,2].map(i=><Skeleton key={i} className="h-16"/>)}</div>:!filtered.length?<EmptyState icon={<Users size={24}/>} title={error?'Users unavailable':'No users found'} description={error?'Try reloading the directory.':'Try another search or create an account.'} actionLabel={error?'Retry':'Create account'} onAction={()=>error?void load():setCreating(true)}/>:<div className="divide-y divide-border">{filtered.slice(page*10,page*10+10).map(u=><article key={u.id} className="flex flex-wrap items-center gap-4 p-4 hover:bg-surface-muted/60"><Avatar name={u.full_name || u.username} size="lg"/><div className="min-w-[180px] flex-1"><h2 className="font-medium">{u.full_name || u.username}</h2><p className="break-all text-xs text-text-muted">{u.username} · {u.email}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{u.role}</span><span className={`text-xs font-medium ${u.is_active?'text-success':'text-text-muted'}`}>{u.is_active?'Active':'Disabled'}</span><div className="flex w-full gap-2 sm:w-auto"><Button size="sm" variant="secondary" onClick={()=>{setSelected(u.id);setError('');setNotice('');}}>Manage</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setToggleUser(u)}>{u.is_active?'Deactivate':'Activate'}</Button></div></article>)}</div>}
    <div className="flex items-center justify-between gap-3 border-t border-border p-4"><Button size="sm" variant="secondary" disabled={!page} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-xs text-text-muted">Page {page+1} · {filtered.length} users</span><Button size="sm" variant="secondary" disabled={(page+1)*10>=filtered.length} onClick={()=>setPage(page+1)}>Next</Button></div></section>
    <Modal isOpen={creating} onClose={()=>!busy&&setCreating(false)} title="Create campus account"><form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await apiClient.post('/auth/users',form);setForm({...form,password:''});setCreating(false);});}}>{error&&<p role="alert" className="text-sm text-danger">{error}</p>}{(['username','full_name','email','password'] as const).map(k=><label key={k} className="block text-sm font-medium capitalize">{k.replace('_',' ')}<input className={inputClass} required minLength={k==='password'?8:undefined} type={k==='password'?'password':k==='email'?'email':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label className="block text-sm font-medium">Role<select className={inputClass} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{['FACULTY','HOD','OPERATOR','ADMIN','STUDENT'].map(r=><option key={r}>{r}</option>)}</select></label>{form.role === 'HOD' && <label className="block text-sm font-medium">Department<input className={inputClass} required maxLength={64} value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></label>}<Button type="submit" disabled={busy} className="w-full">{busy?'Creating…':'Create account'}</Button></form></Modal>
    <Modal isOpen={!!selected} onClose={()=>!busy&&setSelected('')} title={`Manage ${selectedUser?.username || 'account'}`}><div className="space-y-6">{feedback}<form onSubmit={e=>{e.preventDefault();void run(async()=>{await apiClient.patch(`/auth/users/${selected}`,{password});setPassword('');});}} className="space-y-3"><label className="block text-sm font-medium">New password<input required minLength={8} type="password" className={inputClass} value={password} onChange={e=>setPassword(e.target.value)}/></label><Button type="submit" disabled={busy}>Reset password</Button></form>{selectedUser?.role==='FACULTY'&&<TeacherClasses key={selected} teacherId={selected} />}{selectedUser?.role==='STUDENT'&&<form className="space-y-3 border-t border-border pt-5" onSubmit={e=>{e.preventDefault();void run(()=>apiClient.put(`/auth/users/${selected}/student`,{roll_number:roll,student_code:code}));}}><h3 className="font-semibold">Link a student record</h3><label className="block text-sm">Roll number<input required className={inputClass} value={roll} onChange={e=>setRoll(e.target.value)}/></label><label className="block text-sm">Student code<input required className={inputClass} value={code} onChange={e=>setCode(e.target.value)}/></label><Button type="submit" disabled={busy}>Link student</Button></form>}</div></Modal>
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

type AttendanceItem = PeriodRecord & { remarks: string | null };
type PersonalAttendance = { linked: boolean; profile?: StudentProfile; items: AttendanceItem[] };
const presenceStatuses = new Set(['PRESENT', 'LATE', 'MANUAL_PRESENT']);

function AttendanceDashboard({ items, requests, onSaved }: { items: AttendanceItem[]; requests: RequestState | null; onSaved: () => void }) {
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState('75');
  const subjects = [...new Set(items.map(row => row.subject))].sort();
  const datesValid = !from || !to || from <= to;
  const filtered = datesValid ? items.filter(row =>
    (!subject || row.subject === subject) && (!from || row.date >= from) && (!to || row.date <= to)
  ) : [];
  const attended = filtered.filter(row => presenceStatuses.has(row.status)).length;
  const total = filtered.length;
  const percentage = total ? (attended * 100 / total).toFixed(1) : '0';
  const targetPercent = Number(target);
  const targetValid = Number.isInteger(targetPercent) && targetPercent >= 1 && targetPercent <= 100;
  const needed = targetPercent < 100
    ? Math.max(0, Math.ceil((targetPercent * total - 100 * attended) / (100 - targetPercent)))
    : null;

  if (!items.length) {
    return <EmptyState title="No attendance recorded yet" description="Your attendance history will appear after your first recorded session." />;
  }

  return <>
    <section className="space-y-5 rounded-xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Attendance overview</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">Subject
          <select className={fieldClass} value={subject} onChange={event => setSubject(event.target.value)}>
            <option value="">All subjects</option>
            {subjects.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">From
          <input className={fieldClass} type="date" value={from} onChange={event => setFrom(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">To
          <input className={fieldClass} type="date" value={to} onChange={event => setTo(event.target.value)} />
        </label>
      </div>
      {!datesValid && <p role="alert" className="text-sm text-danger">Choose an end date on or after the start date.</p>}
      {datesValid && total === 0 && <p className="text-sm text-text-muted">No sessions match these filters.</p>}
      {total > 0 && <>
        <p><strong>{percentage}%</strong> · {attended} of {total} recorded sessions attended</p>
        {attended * 100 < 75 * total && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            Attendance in this view is below 75%. Review the sessions below and request a correction if a mark is incorrect.
          </p>
        )}
        <div className="space-y-2">
          {subjects.filter(name => !subject || name === subject).map(name => {
            const records = filtered.filter(row => row.subject === name);
            if (!records.length) return null;
            const count = records.filter(row => presenceStatuses.has(row.status)).length;
            return <div key={name} className="flex justify-between gap-4 text-sm">
              <span>{name}</span><span>{count}/{records.length}</span>
            </div>;
          })}
        </div>
        <p className="text-xs text-text-muted">Present, late, and manual-present marks count as attendance.</p>
        <div className="space-y-2 border-t border-border pt-4">
          <label className="block max-w-40 text-sm font-medium">Attendance target (%)
            <input className={fieldClass} type="number" min="1" max="100" step="1" value={target}
              onChange={event => setTarget(event.target.value)} />
          </label>
          <p className="text-sm" aria-live="polite">
            {!targetValid ? 'Enter a whole percentage from 1 to 100.'
              : 100 * attended >= targetPercent * total ? 'You’ve reached this target.'
              : needed === null ? 'A 100% target is out of reach with the current records.'
              : `Attend the next ${needed} consecutive ${needed === 1 ? 'session' : 'sessions'} to reach this target.`}
          </p>
          <p className="text-xs text-text-muted">The estimate uses the filtered records.</p>
        </div>
      </>}
    </section>
    {total > 0 && <section className="rounded-xl border border-border bg-surface">
      <h2 className="border-b border-border p-5 font-semibold">Session history</h2>
      <div className="divide-y divide-border">
        {filtered.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="text-sm font-medium">{row.subject}</h3>
            <p className="text-xs text-text-muted">{row.date}{row.remarks ? ` · ${row.remarks}` : ''}</p>
          </div>
          <StatusBadge status={row.status} category="attendance" />
          {requests && <CorrectionForm record={row} request={requests.items.find(req => req.record_id === row.id)} onSaved={onSaved} />}
        </article>)}
      </div>
    </section>}
  </>;
}

const studentLinks = [
  { tab: 'my-timetable', label: 'My Timetable', icon: CalendarDays },
  { tab: 'classmates', label: 'Classmates', icon: UsersRound },
  { tab: 'classroom', label: 'Classroom', icon: BookOpen },
];

export function MyAttendancePage({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<PersonalAttendance | null>(null);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requests, setRequests] = useState<RequestState | null>(null);
  const loadRequests = useCallback(async () => {
    try {
      setRequests((await apiClient.get<RequestState>('/student-portal/requests')).data);
      setRequestError('');
    } catch (err) {
      setRequestError(formatApiErrorMessage(err, 'Unable to load student requests.'));
    }
  }, []);
  const load = useCallback(async () => {
    try {
      setData((await apiClient.get<PersonalAttendance>('/auth/my-attendance')).data);
      setError('');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to load attendance.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const linked = Boolean(data?.linked);
  useEffect(() => { if (linked) void loadRequests(); }, [linked, loadRequests]);

  return <div className="space-y-6">
    <header className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <h1 className="text-3xl font-semibold tracking-tight">My attendance</h1>
      {data?.profile && <p className="mt-2 text-sm text-text-muted">{data.profile.name} · {data.profile.class_name}</p>}
      <nav aria-label="Student shortcuts" className="mt-5 grid gap-2 sm:grid-cols-3">
        {studentLinks.map(({ tab, label, icon: Icon }) => <button key={tab} onClick={() => onNavigate(tab)}
          className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-muted px-3 text-left text-sm font-semibold hover:border-primary hover:text-primary">
          <Icon size={19} aria-hidden="true" className="shrink-0 text-primary" />
          <span className="flex-1">{label}</span><ArrowUpRight size={15} aria-hidden="true" />
        </button>)}
      </nav>
    </header>
    {error ? <EmptyState title="Attendance unavailable" description={error} actionLabel="Retry" onAction={() => void load()} />
      : !data ? <Skeleton className="h-64" />
      : !data.linked ? <EmptyState title="Connect your student record" description="Ask your administrator to link your account using your roll number and student code." />
      : <>
        <PeriodCalendar records={data.items} />
        {data.profile && <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Student details</summary>
          <div className="mt-3"><StudentDetails profile={data.profile} /></div>
        </details>}
        {requests && <FaceRequests state={requests} onSaved={() => void loadRequests()} />}
        <AttendanceDashboard items={data.items} requests={requests} onSaved={() => void loadRequests()} />
        {requestError && <EmptyState title="Student requests unavailable" description={requestError}
          actionLabel="Retry" onAction={() => void loadRequests()} />}
      </>}
  </div>;
}

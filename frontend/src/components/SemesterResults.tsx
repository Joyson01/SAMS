import { FormEvent, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

type Subject = { id: string; name: string; code: string; academic_year: string; semester: number };
type Mark = Omit<Subject, 'id'> & { subject_id: string; marks: number; maximum: number };
type Student = { id: string; class_name: string; first_name: string; last_name: string; roll_number: string };
type Sheet = { results: Mark[]; subjects: Subject[] };
const field = 'block w-full rounded border bg-white p-2 text-slate-900';

function ResultList({ results }: { results: Mark[] }) {
  const groups = new Map<string, Mark[]>();
  for (const result of results) {
    const title = `${result.academic_year} · Semester ${result.semester}`;
    const group = groups.get(title) ?? [];
    group.push(result);
    groups.set(title, group);
  }
  if (!groups.size) return <p>No marks published yet.</p>;
  return <div className="space-y-4">{Array.from(groups, ([title, group]) =>
    <table key={title} className="w-full text-left text-sm">
      <caption className="pb-2 text-left font-semibold">{title}</caption>
      <thead><tr><th scope="col">Subject</th><th scope="col">Marks</th></tr></thead>
      <tbody>{group.map(row => <tr key={row.subject_id} className="border-t">
        <td className="py-2">{row.code} · {row.name}</td><td>{row.marks} / {row.maximum}</td>
      </tr>)}</tbody>
      <tfoot><tr className="border-t font-semibold"><td>Total</td>
        <td>{group.reduce((sum, row) => sum + row.marks, 0)} / {group.reduce((sum, row) => sum + row.maximum, 0)}</td>
      </tr></tfoot>
    </table>)}</div>;
}

function SheetView({ studentId }: { studentId?: string }) {
  const [sheet, setSheet] = useState<Sheet>();
  const [subjectId, selectSubject] = useState('');
  const [marks, setMarks] = useState('');
  const [maximum, setMaximum] = useState('100');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const path = `/semester-results/students/${studentId}`;
  useEffect(() => {
    let live = true;
    const request = studentId ? apiClient.get<Sheet>(path).then(r => r.data)
      : apiClient.get<Mark[]>('/semester-results/mine').then(r => ({ results: r.data, subjects: [] }));
    request.then(data => { if (live) setSheet(data); })
      .catch(() => { if (live) setError('Could not load the marksheet.'); });
    return () => { live = false; };
  }, [path, studentId]);

  function chooseSubject(id: string) {
    const subject = sheet?.subjects.find(s => s.id === id);
    const current = sheet?.results.find(r => r.subject_id === id && r.academic_year === subject?.academic_year && r.semester === subject?.semester);
    selectSubject(id);
    setMarks(current ? String(current.marks) : '');
    setMaximum(current ? String(current.maximum) : '100');
    setNotice('');
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiClient.put<Mark[]>(path, {
        subject_id: subjectId, marks: Number(marks), maximum: Number(maximum),
      });
      setSheet(current => current && ({ ...current, results: response.data }));
      setNotice('Marks published to the student portal.');
    } catch {
      setError('Could not publish marks. Check the values and reload to see any recent changes.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-4">
    {error && <p role="alert">{error}</p>}
    {!sheet && !error && <p role="status">Loading marksheet…</p>}
    {sheet && <>
      {studentId && <form onSubmit={publish} className="space-y-3">
        <label className="block">Subject<select required value={subjectId} className={field} onChange={e => chooseSubject(e.target.value)}>
          <option value="">Choose a subject</option>
          {sheet.subjects.map(s => <option key={s.id} value={s.id}>{s.academic_year} · Sem {s.semester} · {s.code} · {s.name}</option>)}
        </select></label>
        <div className="grid grid-cols-2 gap-2">
          <label>Marks obtained<input className={field} required type="number" min="0" max={maximum || 100000} value={marks} onChange={e => setMarks(e.target.value)} /></label>
          <label>Maximum marks<input className={field} required type="number" min="1" max="100000" value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
        </div>
        <button className="rounded bg-blue-700 px-3 py-2 text-white" disabled={!subjectId || saving}>{saving ? 'Publishing…' : 'Publish marks'}</button>
        {notice && <p role="status">{notice}</p>}
      </form>}
      <ResultList results={sheet.results} />
    </>}
  </div>;
}

export function SemesterResults({ studentView = false }: { studentView?: boolean }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (studentView) return;
    let live = true;
    apiClient.get<Student[]>('/semester-results/students').then(({ data }) => {
      if (live) setStudents(data);
    }).catch(() => { if (live) setError('Could not load the student list.'); });
    return () => { live = false; };
  }, [studentView]);
  return <section className="space-y-4 rounded-xl border p-4">
    <h2 className="text-lg font-semibold">Semester marksheet</h2>
    {!studentView && <label className="block">Student<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">Choose a student</option>
      {students.map(s => <option key={s.id} value={s.id}>{s.class_name} · {s.roll_number} · {s.first_name} {s.last_name}</option>)}
    </select></label>}
    {error && <p role="alert">{error}</p>}
    {(studentView || selected) && <SheetView key={studentView ? 'mine' : selected} studentId={studentView ? undefined : selected} />}
  </section>;
}

import { useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

interface ImportResult {
  ready: number;
  imported: number;
  errors: { row: number; message: string }[];
}

const csvTemplate = 'student_code,roll_number,first_name,last_name,email,department,class_name\r\n';
const templateUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvTemplate);

export function StudentImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(dryRun: boolean) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError('');
    try {
      const { data } = await apiClient.post<ImportResult>('/students/import-roster', form, {
        params: { dry_run: dryRun },
      });
      setResult(data);
      if (data.imported) onImported();
    } catch (err) {
      setResult(null);
      setError(formatApiErrorMessage(err, 'Could not process the roster.'));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setResult(null);
    setFile(null);
    setError('');
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Import roster</Button>
      <Modal isOpen={open} onClose={close} title="Import students">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Use an existing class and its department on each row. Upload up to 500 students in a CSV or Excel file. In Excel, format student codes and roll numbers as text.
          </p>
          <a className="inline-flex min-h-11 items-center text-primary underline" href={templateUrl} download="student-import.csv">
            Download CSV template
          </a>
          <label className="block space-y-2 text-sm">
            <span>Student roster</span>
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setError('');
            }} className="block w-full" />
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {result && (
            <div aria-live="polite" className="space-y-2">
              <p>{result.imported ? `${result.imported} students imported.` : `${result.ready} rows ready to import.`}</p>
              {!!result.errors.length && (
                <ul className="max-h-44 list-disc overflow-auto pl-6 text-sm text-danger">
                  {result.errors.map((issue) => <li key={issue.row}>Row {issue.row} · {issue.message}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!file || busy || !!result?.imported} onClick={() => void submit(true)}>
              Preview file
            </Button>
            <Button disabled={busy || !result || !result.ready || !!result.errors.length || !!result.imported} onClick={() => void submit(false)}>
              Import students
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

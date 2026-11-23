import { useDialogFeedback } from '../../components/common/useDialogFeedback';
import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  GraduationCap,
  AlertCircle,
  Clock,
  Award,
  Calendar,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import {
  fetchSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  fetchClasses,
  createClass,
  updateClass,
  deleteClass,
  fetchAllTimetableEntries,
} from '../../services/subjectApi';
import {
  Subject,
  SubjectCreatePayload,
  ClassSection,
  ClassSectionCreatePayload,
  TimetableEntry,
} from '../../types/subject';
import { formatApiErrorMessage } from '../../utils/apiError';

interface SubjectManagementPageProps {
  onNavigate?: (tab: string, extra?: string) => void;
}

export const SubjectManagementPage: React.FC<SubjectManagementPageProps> = ({ onNavigate }) => {
  const { confirmAction, notify, feedback } = useDialogFeedback();
  const [activeTab, setActiveTab] = useState<'subjects' | 'classes' | 'timetable'>('subjects');

  // Subjects state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(true);
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [verticalFilter, setVerticalFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Subject Modals
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState<boolean>(false);
  const [viewingSubject, setViewingSubject] = useState<Subject | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectCreatePayload>({
    code: '',
    name: '',
    short_name: '',
    vertical: 'PCC',
    department: 'Computer Engineering',
    theory_hours: 3,
    tutorial_hours: 0,
    practical_hours: 0,
    theory_credits: 3,
    tutorial_credits: 0,
    practical_credits: 0,
    credits: 3,
    status: 'ACTIVE',
    assigned_classes: [],
  });

  // Classes state
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [isClassModalOpen, setIsClassModalOpen] = useState<boolean>(false);
  const [viewingClass, setViewingClass] = useState<ClassSection | null>(null);
  const [editingClass, setEditingClass] = useState<ClassSection | null>(null);
  const [classForm, setClassForm] = useState<ClassSectionCreatePayload>({
    name: '',
    department: 'Computer Engineering',
    effective_from: '',
    section: '',
    status: 'ACTIVE',
    assigned_subject_ids: [],
  });

  // Timetable state
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState<boolean>(false);

  const [loadErrors, setLoadErrors] = useState({ subjects: '', classes: '', timetable: '' });
  const [scheduleClass, setScheduleClass] = useState('');
  const loadError = loadErrors[activeTab];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    setLoadErrors(previous => ({ ...previous, subjects: '' }));
    try {
      const data = await fetchSubjects();
      setSubjects(data);
    } catch (err) {
      setLoadErrors(previous => ({ ...previous, subjects: formatApiErrorMessage(err, 'Unable to load subjects. Please try again.') }));
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setLoadErrors(previous => ({ ...previous, classes: '' }));
    try {
      const data = await fetchClasses();
      setClasses(data);
    } catch (err) {
      setLoadErrors(previous => ({ ...previous, classes: formatApiErrorMessage(err, 'Unable to load classes. Please try again.') }));
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadTimetable = useCallback(async () => {
    setLoadingTimetable(true);
    setLoadErrors(previous => ({ ...previous, timetable: '' }));
    try {
      const data = await fetchAllTimetableEntries();
      setTimetableEntries(data);
    } catch (err) {
      setLoadErrors(previous => ({ ...previous, timetable: formatApiErrorMessage(err, 'Unable to load timetable. Please try again.') }));
    } finally {
      setLoadingTimetable(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (activeTab === 'timetable') {
      loadTimetable();
    }
  }, [activeTab, loadTimetable]);

  // Handle Subject Form Submit
  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      // Auto calculate total credits
      const totalCreds =
        (Number(subjectForm.theory_credits) || 0) +
        (Number(subjectForm.tutorial_credits) || 0) +
        (Number(subjectForm.practical_credits) || 0);

      const payload = {
        ...subjectForm,
        credits: totalCreds === 0 && editingSubject && !editingSubject.theory_credits && !editingSubject.tutorial_credits && !editingSubject.practical_credits
          ? editingSubject.credits : totalCreds,
      };

      if (editingSubject) {
        await updateSubject(editingSubject.id, payload);
      } else {
        await createSubject(payload);
      }
      setIsSubjectModalOpen(false);
      setEditingSubject(null);
      loadSubjects();
      loadClasses();
    } catch (err: unknown) {
      setErrorMessage(
        formatApiErrorMessage(err, 'Failed to save subject. Make sure the course code is unique.')
      );
    }
  };

  // Handle Delete / Deactivate Subject
  const handleDeleteSubject = async (subj: Subject) => {
    if (
      await confirmAction(
        subj.total_sessions_count > 0
          ? `Subject "${subj.code}" has ${subj.total_sessions_count} sessions. It will be marked INACTIVE to preserve historical attendance. Proceed?`
          : `Are you sure you want to delete course "${subj.code} - ${subj.name}"?`
      )
    ) {
      try {
        await deleteSubject(subj.id);
        loadSubjects();
        loadClasses();
      } catch (err) {
        notify(formatApiErrorMessage(err, 'Failed to delete/deactivate subject.'));
      }
    }
  };

  // Handle Class Form Submit
  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (editingClass) {
        await updateClass(editingClass.id, classForm);
      } else {
        await createClass(classForm);
      }
      setIsClassModalOpen(false);
      setEditingClass(null);
      loadClasses();
      loadSubjects();
    } catch (err: unknown) {
      setErrorMessage(
        formatApiErrorMessage(err, 'Failed to save class. Make sure the class name is unique.')
      );
    }
  };

  // Handle Delete Class
  const handleDeleteClass = async (clsObj: ClassSection) => {
    if (
      await confirmAction(
        `Are you sure you want to delete class "${clsObj.name}"? All timetable slots for this class will also be removed.`
      )
    ) {
      try {
        await deleteClass(clsObj.id);
        loadClasses();
        loadSubjects();
      } catch (err) {
        notify(formatApiErrorMessage(err, 'Failed to delete class.'));
      }
    }
  };

  const openAddSubjectModal = () => {
    setEditingSubject(null);
    setSubjectForm({
      code: '',
      name: '',
      short_name: '',
      vertical: 'PCC',
      department: 'Computer Engineering',
      theory_hours: 3,
      tutorial_hours: 0,
      practical_hours: 0,
      theory_credits: 3,
      tutorial_credits: 0,
      practical_credits: 0,
      credits: 3,
      status: 'ACTIVE',
      assigned_classes: [],
    });
    setErrorMessage(null);
    setIsSubjectModalOpen(true);
  };

  const openEditSubjectModal = (subj: Subject) => {
    setEditingSubject(subj);
    setSubjectForm({
      code: subj.code,
      name: subj.name,
      short_name: subj.short_name || '',
      vertical: subj.vertical || '',
      department: subj.department,
      theory_hours: subj.theory_hours || 0,
      tutorial_hours: subj.tutorial_hours || 0,
      practical_hours: subj.practical_hours || 0,
      theory_credits: subj.theory_credits || 0,
      tutorial_credits: subj.tutorial_credits || 0,
      practical_credits: subj.practical_credits || 0,
      credits: subj.credits,
      semester: subj.semester,
      academic_year: subj.academic_year,
      status: subj.status,
      assigned_classes: subj.assigned_classes || [],
    });
    setErrorMessage(null);
    setIsSubjectModalOpen(true);
  };

  const openAddClassModal = () => {
    setEditingClass(null);
    setClassForm({
      name: '',
      department: 'Computer Engineering',
      effective_from: '',
      section: '',
      status: 'ACTIVE',
      assigned_subject_ids: [],
    });
    setErrorMessage(null);
    setIsClassModalOpen(true);
  };

  const [query, setQuery] = useState('');
  const [requestedPage, setRequestedPage] = useState(0);
  const filteredClasses = classes.filter(c => `${c.name} ${c.department}`.toLowerCase().includes(query.toLowerCase()));
  const filteredSubjects = subjects.filter((s) => {
    if (!`${s.code} ${s.name}`.toLowerCase().includes(subjectSearch.toLowerCase())) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (verticalFilter && s.vertical !== verticalFilter) return false;
    return true;
  });

  const totalCurriculumCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);

  const rowCount = activeTab === 'subjects' ? filteredSubjects.length : filteredClasses.length;
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(rowCount / 10) - 1));
  const linkedCourses = subjects.filter(subject => viewingClass && subject.assigned_classes?.includes(viewingClass.name));
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const schedule = timetableEntries.filter(entry => !scheduleClass || entry.class_id === scheduleClass)
    .sort((a, b) => dayNames.indexOf(a.day_of_week.toLowerCase()) - dayNames.indexOf(b.day_of_week.toLowerCase()) || a.start_time.localeCompare(b.start_time));

  return (
    <div className="space-y-6">
      {feedback}
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-sm text-danger"><p>{loadError}</p><button className="min-h-11 font-semibold underline" onClick={{ subjects: loadSubjects, classes: loadClasses, timetable: loadTimetable }[activeTab]}>Retry</button></div>}
      {activeTab !== 'timetable' && <div className="flex flex-wrap items-center gap-3">
        {activeTab === 'classes' && <label>Search classes <input className="rounded border p-2" value={query} onChange={e => { setQuery(e.target.value); setRequestedPage(0); }} /></label>}
        {rowCount > 10 && <>
          <button disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(rowCount / 10)}</span>
          <button disabled={(page + 1) * 10 >= rowCount} onClick={() => setRequestedPage(page + 1)}>Next</button>
        </>}
      </div>}
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Academic Curriculum & Schedule</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Official curriculum structure, courses, contact hours, and timetable scheduling.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex flex-wrap items-center bg-surface-muted p-1 rounded-xl border border-border shadow-inner">
          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'subjects'
                ? 'bg-surface text-indigo-700 shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Courses ({subjects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'classes'
                ? 'bg-surface text-indigo-700 shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Classes & Sections ({classes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'timetable'
                ? 'bg-surface text-indigo-700 shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Weekly Timetable</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Curriculum</h2>
          <p className="mt-1 text-sm text-text-muted">{loadingSubjects ? 'Loading courses…' : loadErrors.subjects ? 'Course totals unavailable' : `${subjects.length} courses · ${totalCurriculumCredits} credits`}</p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'subjects' && (
            <button
              onClick={openAddSubjectModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface text-indigo-700 hover:bg-indigo-50 font-bold text-xs shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Course</span>
            </button>
          )}
          {activeTab === 'classes' && (
            <button
              onClick={openAddClassModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface text-indigo-700 hover:bg-indigo-50 font-bold text-xs shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Class Section</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SUBJECTS / COURSES */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border shadow-sm text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by course code or name..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-surface-muted border border-border rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={verticalFilter}
                onChange={(e) => setVerticalFilter(e.target.value)}
                className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Verticals</option>
                <option value="PCC">PCC (Core)</option>
                <option value="PEC">PEC (Elective)</option>
                <option value="MDM">MDM (Minor)</option>
                <option value="OE">OE (Open Elective)</option>
                <option value="VSEC">VSEC (Skill / Lab)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>

              <button
                onClick={loadSubjects}
                className="p-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text-muted transition"
                title="Refresh Courses"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Subjects Table */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            {loadingSubjects ? (
              <div className="p-12 text-center text-text-muted text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading courses...</span>
              </div>
            ) : loadError ? null : filteredSubjects.length === 0 ? (
              <div className="p-12 text-center text-text-muted text-xs space-y-2">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-text">No Courses Found</p>
                <p className="text-[11px] text-text-muted">No academic subjects match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted border-b border-border text-text-muted font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Course Code</th>
                      <th className="py-3.5 px-4">Course Name</th>
                      <th className="py-3.5 px-4">Vertical</th>
                      <th className="py-3.5 px-4">Contact Hours</th>
                      <th className="py-3.5 px-4">Credits Allotted</th>
                      <th className="py-3.5 px-4">Total Credits</th>
                      <th className="py-3.5 px-4">Assigned Class</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredSubjects.slice(page*10,page*10+10).map((s) => (
                      <tr key={s.id} className="hover:bg-surface-muted/75 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">
                          {s.code}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-text">
                          <div>{s.name}</div>
                          {s.short_name && (
                            <span className="text-[10px] text-text-muted font-normal">({s.short_name})</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.vertical === 'PCC'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : s.vertical === 'PEC'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : s.vertical === 'MDM'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : s.vertical === 'OE'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {s.vertical || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-text-muted font-mono text-[11px]">
                          {s.theory_hours || 0}T · {s.tutorial_hours || 0}Tu · {s.practical_hours || 0}P
                        </td>
                        <td className="py-3.5 px-4 text-text-muted font-mono text-[11px]">
                          {s.theory_credits || 0} · {s.tutorial_credits || 0} · {s.practical_credits || 0}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-bold text-text bg-surface-muted px-2.5 py-1 rounded-lg">
                            <Award className="w-3 h-3 text-amber-500" />
                            <span>{s.credits} Credits</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {s.assigned_classes && s.assigned_classes.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-muted text-text font-bold text-[10px]">
                              {s.assigned_classes.join(', ')}
                            </span>
                          ) : (
                            <span className="text-text-muted font-normal">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-surface-muted text-text-muted'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                s.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{s.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1">
                          <button
                            onClick={() => setViewingSubject(s)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="View Course Structure Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditSubjectModal(s)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Edit Course"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubject(s)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete Course"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CLASSES & SECTIONS */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingClasses ? (
              <div className="col-span-full p-12 text-center text-text-muted text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading classes...</span>
              </div>
            ) : loadError ? null : filteredClasses.length === 0 ? (
              <div className="col-span-full bg-surface p-12 text-center text-text-muted text-xs rounded-2xl border border-border space-y-2">
                <GraduationCap className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-text">No Classes Found</p>
                <p className="text-[11px] text-text-muted">{query ? 'Try another class name or department.' : 'Create a class section to get started.'}</p>
              </div>
            ) : (
              filteredClasses.slice(page*10,page*10+10).map((clsObj) => (
                <div
                  key={clsObj.id}
                  className="bg-surface rounded-2xl border border-border p-5 shadow-sm space-y-4 hover:border-indigo-300 transition flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs">
                        {clsObj.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>{clsObj.status}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-base text-text">{clsObj.department}</h3>
                      <p className="text-xs text-text-muted font-medium">
                        Effective From: <span className="text-text font-bold">{clsObj.effective_from || 'Not set'}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-xs">
                      <div className="bg-surface-muted p-2.5 rounded-xl text-center">
                        <div className="text-[10px] text-text-muted uppercase font-bold">Curriculum</div>
                        <div className="font-bold text-text text-sm mt-0.5">
                          {clsObj.total_curriculum_credits ?? '—'} Credits
                        </div>
                      </div>
                      <div className="bg-surface-muted p-2.5 rounded-xl text-center">
                        <div className="text-[10px] text-text-muted uppercase font-bold">Subjects</div>
                        <div className="font-bold text-text text-sm mt-0.5">
                          {clsObj.subject_count ?? '—'} Courses
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                    <span className="text-text-muted font-medium">
                      Enrolled: <span className="font-bold text-text">{clsObj.student_count} Students</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewingClass(clsObj)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs transition"
                      >
                        View Details
                      </button>
                      <button title="Edit Class" aria-label={`Edit ${clsObj.name}`} className="p-1.5" onClick={() => {
                        setEditingClass(clsObj);
                        setClassForm({ name: clsObj.name, department: clsObj.department, section: clsObj.section, effective_from: clsObj.effective_from ?? '', status: clsObj.status });
                        setErrorMessage(null);
                        setIsClassModalOpen(true);
                      }}><Edit2 className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => handleDeleteClass(clsObj)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Delete Class"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'timetable' && (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <label className="flex items-center gap-3">Class
            <select value={scheduleClass} onChange={event => setScheduleClass(event.target.value)} className="rounded border p-2">
              <option value="">All classes</option>
              {classes.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          {onNavigate && <button className="text-sm font-semibold underline" onClick={() => onNavigate('timetable')}>Manage timetable slots</button>}
          {loadingTimetable ? <p>Loading timetable…</p> : loadError ? null : schedule.length === 0 ? <p>No timetable entries for this selection.</p> :
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead><tr>{['Day', 'Time', 'Class', 'Course or activity', 'Batch', 'Room'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
              <tbody>{schedule.map(entry => <tr key={entry.id} className="border-t border-border">
                <td className="p-2">{entry.day_of_week}</td><td className="p-2 whitespace-nowrap">{entry.start_time} – {entry.end_time}</td>
                <td className="p-2">{entry.class_name || classes.find(section => section.id === entry.class_id)?.name || '—'}</td>
                <td className="p-2">{entry.label || entry.subject_name || entry.entry_type}</td>
                <td className="p-2">{entry.batch || '—'}</td><td className="p-2">{entry.room || '—'}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      )}

      {/* MODAL: VIEW SUBJECT DETAIL */}
      {viewingSubject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-lg max-h-[90dvh] overflow-y-auto w-full p-6 space-y-5 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  {viewingSubject.vertical || '—'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-text">{viewingSubject.name}</h3>
                  <p className="text-xs text-indigo-600 font-mono font-bold">{viewingSubject.code}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingSubject(null)}
                className="p-1 text-text-muted hover:text-text-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Department & Track */}
              <div className="grid grid-cols-2 gap-3 bg-surface-muted p-3.5 rounded-xl border border-border">
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">Department</div>
                  <div className="font-bold text-text text-xs mt-0.5">{viewingSubject.department}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-bold">Vertical Track</div>
                  <div className="font-bold text-text text-xs mt-0.5">{viewingSubject.vertical || 'Unspecified'}</div>
                </div>
              </div>

              {/* Contact Hours Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-text flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Contact Hours</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-indigo-50/60 p-2 rounded-xl border border-indigo-100">
                    <div className="text-[10px] text-indigo-600 font-bold">Theory</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.theory_hours || 0} Hours</div>
                  </div>
                  <div className="bg-indigo-50/60 p-2 rounded-xl border border-indigo-100">
                    <div className="text-[10px] text-indigo-600 font-bold">Tutorial</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.tutorial_hours || 0} Hours</div>
                  </div>
                  <div className="bg-indigo-50/60 p-2 rounded-xl border border-indigo-100">
                    <div className="text-[10px] text-indigo-600 font-bold">Practical</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.practical_hours || 0} Hours</div>
                  </div>
                </div>
              </div>

              {/* Credits Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-text flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Credits Allotted</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Theory</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.theory_credits || 0}</div>
                  </div>
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Tutorial</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.tutorial_credits || 0}</div>
                  </div>
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Practical</div>
                    <div className="text-sm font-bold text-text mt-0.5">{viewingSubject.practical_credits || 0}</div>
                  </div>
                </div>
              </div>

              {/* Total Summary */}
              <div className="flex items-center justify-between p-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-sm">
                <span>Total Course Credits</span>
                <span className="text-base">{viewingSubject.credits} Credits</span>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                onClick={() => setViewingSubject(null)}
                className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW CLASS DETAIL */}
      {viewingClass && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow">
                  {viewingClass.name}
                </div>
                <div>
                  <h3 className="font-bold text-base text-text">{viewingClass.department}</h3>
                  <p className="text-xs text-text-muted">
                    Class: <span className="font-bold text-indigo-700">{viewingClass.name}</span> · Effective: <span className="font-bold text-text">{viewingClass.effective_from || 'Not set'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingClass(null)}
                className="p-1 text-text-muted hover:text-text-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Quick Metrics */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-surface-muted p-3 rounded-xl border border-border">
                  <div className="text-[10px] text-text-muted uppercase font-bold">Total Credits</div>
                  <div className="text-base font-bold text-indigo-600 mt-0.5">{viewingClass.total_curriculum_credits ?? '—'} Credits</div>
                </div>
                <div className="bg-surface-muted p-3 rounded-xl border border-border">
                  <div className="text-[10px] text-text-muted uppercase font-bold">Curriculum Units</div>
                  <div className="text-base font-bold text-text mt-0.5">{viewingClass.subject_count ?? '—'} Subjects</div>
                </div>
                <div className="bg-surface-muted p-3 rounded-xl border border-border">
                  <div className="text-[10px] text-text-muted uppercase font-bold">Enrolled Students</div>
                  <div className="text-base font-bold text-text mt-0.5">{viewingClass.student_count}</div>
                </div>
              </div>

              {/* Assigned Subjects Roster */}
              <div className="space-y-2">
                <div className="font-bold text-text flex items-center justify-between text-xs">
                  <span>Assigned Curriculum Courses</span>
                  <span className="text-text-muted font-normal">{viewingClass.subject_count ?? '—'} courses linked</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {loadingSubjects ? <p>Loading linked courses…</p> : loadErrors.subjects ? <p>Unable to load linked courses.</p> : linkedCourses.length === 0 ? <p>No linked courses.</p> : linkedCourses.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl border border-border bg-surface-muted/60 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="font-mono font-bold text-indigo-700 mr-2">{s.code}</span>
                          <span className="font-medium text-text">{s.name}</span>
                        </div>
                      </div>
                      <span className="font-bold text-text bg-surface px-2 py-0.5 rounded border text-[11px]">
                        {s.credits} Credits
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <button
                onClick={() => {
                  setScheduleClass(viewingClass.id);
                  setViewingClass(null);
                  setActiveTab('timetable');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs transition"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>View Timetable</span>
              </button>
              <button
                onClick={() => setViewingClass(null)}
                className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SUBJECT */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-lg max-h-[90dvh] overflow-y-auto w-full p-6 space-y-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-text">
                {editingSubject ? 'Edit Academic Course' : 'Register New Course'}
              </h3>
              <button
                onClick={() => setIsSubjectModalOpen(false)}
                className="p-1 text-text-muted hover:text-text-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubjectSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-text mb-1">Course Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 24CSPC501C"
                    readOnly={Boolean(editingSubject)}
                    value={subjectForm.code}
                    onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500 font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-text mb-1">Vertical Track</label>
                  <select
                    value={subjectForm.vertical}
                    onChange={(e) => setSubjectForm({ ...subjectForm, vertical: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500 font-semibold"
                  >
                    <option value="">Unspecified</option>
                    <option value="PCC">PCC (Program Core Course)</option>
                    <option value="PEC">PEC (Program Elective Course)</option>
                    <option value="MDM">MDM (Multidisciplinary Minor)</option>
                    <option value="OE">OE (Open Elective)</option>
                    <option value="VSEC">VSEC (Skill / Lab Course)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-text mb-1">Course Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Theoretical Computer Science"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-text mb-1">Abbreviation</label>
                  <input
                    type="text"
                    placeholder="e.g. TCS"
                    value={subjectForm.short_name || ''}
                    onChange={(e) => setSubjectForm({ ...subjectForm, short_name: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-text mb-1">Department *</label>
                  <input
                    type="text"
                    required
                    value={subjectForm.department}
                    onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Contact Hours */}
              <div className="space-y-1">
                <label className="block font-bold text-text">Contact Hours (Theory / Tutorial / Practical)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Theory"
                    value={subjectForm.theory_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, theory_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Tutorial"
                    value={subjectForm.tutorial_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, tutorial_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Practical"
                    value={subjectForm.practical_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, practical_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                </div>
              </div>

              <fieldset className="space-y-1">
                <legend className="font-bold">Assigned classes</legend>
                {classes.map(section => <label key={section.id} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={subjectForm.assigned_classes?.includes(section.name) ?? false}
                    onChange={event => {
                      const selected = subjectForm.assigned_classes ?? [];
                      setSubjectForm({ ...subjectForm, assigned_classes: event.target.checked ? [...selected, section.name] : selected.filter(name => name !== section.name) });
                    }} />{section.name}
                </label>)}
                {!classes.length && <p>{loadErrors.classes ? 'Unable to load classes.' : 'No classes available.'}</p>}
              </fieldset>

              {/* Credit Allocations */}
              <div className="space-y-1">
                <label className="block font-bold text-text">Credit Allotted (Theory / Tutorial / Practical)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Theory Cr"
                    value={subjectForm.theory_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, theory_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Tut Cr"
                    value={subjectForm.tutorial_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, tutorial_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Prac Cr"
                    value={subjectForm.practical_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, practical_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-surface-muted border border-border rounded-xl text-center font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-sm"
                >
                  {editingSubject ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CLASS */}
      {isClassModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-text">
                {editingClass ? 'Edit Class Section' : 'Create Class Section'}
              </h3>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="p-1 text-text-muted hover:text-text-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleClassSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-text mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TE-B"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500 font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-text mb-1">Department *</label>
                <input
                  type="text"
                  required
                  value={classForm.department}
                  onChange={(e) => setClassForm({ ...classForm, department: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-text mb-1">Effective From</label>
                  <input
                    type="text"
                    value={classForm.effective_from || ''}
                    onChange={(e) => setClassForm({ ...classForm, effective_from: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-text mb-1">Section</label>
                  <input
                    type="text"
                    value={classForm.section}
                    onChange={(e) => setClassForm({ ...classForm, section: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-sm"
                >
                  {editingClass ? 'Save Changes' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

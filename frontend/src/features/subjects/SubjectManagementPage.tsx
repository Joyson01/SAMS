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
  Layers,
  CheckCircle2,
  Eye,
  ChevronRight,
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
  onNavigate?: (tab: string, extra?: any) => void;
}

export const SubjectManagementPage: React.FC<SubjectManagementPageProps> = ({ onNavigate }) => {
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
    semester: 5,
    academic_year: '2026-2027',
    status: 'ACTIVE',
    assigned_classes: ['TE-B'],
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
    effective_from: '15/06/2026',
    year: 3,
    semester: 5,
    section: 'B',
    academic_year: '2026-2027',
    status: 'ACTIVE',
    assigned_subject_ids: [],
  });

  // Timetable state
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const data = await fetchSubjects(
        undefined,
        undefined,
        statusFilter || undefined,
        subjectSearch || undefined
      );
      setSubjects(data);
    } catch (err) {
      console.error('Failed to load subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  }, [statusFilter, subjectSearch]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const data = await fetchClasses();
      setClasses(data);
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadTimetable = useCallback(async () => {
    setLoadingTimetable(true);
    try {
      const data = await fetchAllTimetableEntries();
      setTimetableEntries(data);
    } catch (err) {
      console.error('Failed to load timetable:', err);
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
        credits: totalCreds > 0 ? totalCreds : subjectForm.credits,
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
    } catch (err: any) {
      setErrorMessage(
        formatApiErrorMessage(err, 'Failed to save subject. Make sure the course code is unique.')
      );
    }
  };

  // Handle Delete / Deactivate Subject
  const handleDeleteSubject = async (subj: Subject) => {
    if (
      window.confirm(
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
        alert(formatApiErrorMessage(err, 'Failed to delete/deactivate subject.'));
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
    } catch (err: any) {
      setErrorMessage(
        formatApiErrorMessage(err, 'Failed to save class. Make sure the class name is unique.')
      );
    }
  };

  // Handle Delete Class
  const handleDeleteClass = async (clsObj: ClassSection) => {
    if (
      window.confirm(
        `Are you sure you want to delete class "${clsObj.name}"? All timetable slots for this class will also be removed.`
      )
    ) {
      try {
        await deleteClass(clsObj.id);
        loadClasses();
      } catch (err) {
        alert('Failed to delete class.');
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
      semester: 5,
      academic_year: '2026-2027',
      status: 'ACTIVE',
      assigned_classes: ['TE-B'],
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
      vertical: subj.vertical || 'PCC',
      department: subj.department,
      theory_hours: subj.theory_hours || 0,
      tutorial_hours: subj.tutorial_hours || 0,
      practical_hours: subj.practical_hours || 0,
      theory_credits: subj.theory_credits || 0,
      tutorial_credits: subj.tutorial_credits || 0,
      practical_credits: subj.practical_credits || 0,
      credits: subj.credits,
      semester: subj.semester,
      academic_year: subj.academic_year || '2026-2027',
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
      effective_from: '15/06/2026',
      year: 3,
      semester: 5,
      section: 'B',
      academic_year: '2026-2027',
      status: 'ACTIVE',
      assigned_subject_ids: subjects.map((s) => s.id),
    });
    setErrorMessage(null);
    setIsClassModalOpen(true);
  };

  const filteredSubjects = subjects.filter((s) => {
    if (verticalFilter && s.vertical !== verticalFilter) return false;
    return true;
  });

  const totalCurriculumCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Curriculum & Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Official curriculum structure, courses, contact hours, and timetable scheduling.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'subjects'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Courses ({subjects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'classes'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Classes & Sections ({classes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'timetable'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Weekly Timetable</span>
          </button>
        </div>
      </div>

      {/* Curriculum Summary Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-100 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" />
            <span>Department of Computer Engineering</span>
            <span>·</span>
            <span>Class: TE-B</span>
          </div>
          <h2 className="text-lg font-bold">Official Academic Curriculum (Effective: 15/06/2026)</h2>
          <p className="text-xs text-blue-100">
            Total Credits: <span className="font-bold text-white">{totalCurriculumCredits} Credits</span> across <span className="font-bold text-white">{subjects.length} Course Units</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'subjects' && (
            <button
              onClick={openAddSubjectModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Course</span>
            </button>
          )}
          {activeTab === 'classes' && (
            <button
              onClick={openAddClassModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs shadow-sm transition"
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
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by course code or name..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={verticalFilter}
                onChange={(e) => setVerticalFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
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
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>

              <button
                onClick={loadSubjects}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                title="Refresh Courses"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Subjects Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loadingSubjects ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading courses...</span>
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">No Courses Found</p>
                <p className="text-[11px] text-slate-400">No academic subjects match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
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
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubjects.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/75 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                          {s.code}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div>{s.name}</div>
                          {s.short_name && (
                            <span className="text-[10px] text-slate-400 font-normal">({s.short_name})</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.vertical === 'PCC'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : s.vertical === 'PEC'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : s.vertical === 'MDM'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : s.vertical === 'OE'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {s.vertical || 'CORE'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                          {s.theory_hours || 0}T · {s.tutorial_hours || 0}Tu · {s.practical_hours || 0}P
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                          {s.theory_credits || 0} · {s.tutorial_credits || 0} · {s.practical_credits || 0}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                            <Award className="w-3 h-3 text-amber-500" />
                            <span>{s.credits} Credits</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {s.assigned_classes && s.assigned_classes.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {s.assigned_classes.join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">TE-B</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
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
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="View Course Structure Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditSubjectModal(s)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Edit Course"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubject(s)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
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
              <div className="col-span-full p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading classes...</span>
              </div>
            ) : classes.length === 0 ? (
              <div className="col-span-full bg-white p-12 text-center text-slate-400 text-xs rounded-2xl border border-slate-200 space-y-2">
                <GraduationCap className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">No Classes Found</p>
                <p className="text-[11px] text-slate-400">Click "Add Class Section" to create an academic class.</p>
              </div>
            ) : (
              classes.map((clsObj) => (
                <div
                  key={clsObj.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-blue-300 transition flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs">
                        {clsObj.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>{clsObj.status}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-base text-slate-900">{clsObj.department}</h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Effective From: <span className="text-slate-800 font-bold">{clsObj.effective_from || '15/06/2026'}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Curriculum</div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          {clsObj.total_curriculum_credits || 22} Credits
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Subjects</div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          {clsObj.subject_count || 7} Courses
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-medium">
                      Enrolled: <span className="font-bold text-slate-800">{clsObj.student_count} Students</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewingClass(clsObj)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleDeleteClass(clsObj)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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

      {/* TAB 3: WEEKLY TIMETABLE GRID */}
      {activeTab === 'timetable' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-xs">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Department of Computer Engineering · Class: TE-B</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Effective From: <span className="font-bold text-slate-800">15/06/2026</span> · Standard Weekly Timetable
              </p>
            </div>

            {onNavigate && (
              <button
                onClick={() => onNavigate('timetable')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold border border-blue-200 transition text-xs"
              >
                <span>Open Full Timetable View</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Real Table Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loadingTimetable ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading timetable schedule...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left min-w-[850px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold">
                      <th className="py-3 px-3 w-36 text-slate-500 font-mono text-[10px] uppercase tracking-wider border-r border-slate-200 text-center">
                        TIME
                      </th>
                    {daysOfWeek.map((day) => (
                      <th key={day} className="py-3 px-3 border-r border-slate-200 last:border-r-0 font-bold">
                        {day.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 text-xs">
                  {[
                    { start: '09:00', end: '10:00' },
                    { start: '10:00', end: '11:00' },
                    { start: '11:00', end: '12:00' },
                    { start: '12:00', end: '13:00' },
                    { start: '13:00', end: '14:00', isBreak: true },
                    { start: '14:00', end: '15:00' },
                    { start: '15:00', end: '16:00' },
                    { start: '16:00', end: '17:00' },
                  ].map((period) => (
                    <tr key={period.start} className="hover:bg-slate-50/40 transition">
                      <td className="py-2.5 px-2 w-36 border-r border-slate-200 bg-slate-50/50 text-center font-mono text-[11px] text-slate-600 font-bold align-middle">
                        {period.start} – {period.end}
                      </td>
                      {daysOfWeek.map((day) => {
                        const entries = timetableEntries.filter(
                          (e) =>
                            e.day_of_week.toLowerCase() === day.toLowerCase() &&
                            e.start_time.slice(0, 5) === period.start
                        );

                        if (period.isBreak || (entries.length === 1 && entries[0].entry_type === 'BREAK')) {
                          return (
                            <td key={day} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                              <div className="h-full min-h-[72px] bg-amber-50/60 border border-amber-200 rounded-xl flex items-center justify-center p-2 text-center text-amber-800 font-bold text-[11px]">
                                LUNCH BREAK
                              </div>
                            </td>
                          );
                        }

                        if (entries.length === 0) {
                          return (
                            <td key={day} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                              <div className="h-full min-h-[72px] bg-slate-50/30 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-xs">
                                —
                              </div>
                            </td>
                          );
                        }

                        if (entries.length > 1) {
                          return (
                            <td key={day} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                              <div className="h-full min-h-[72px] flex flex-col gap-1">
                                {entries.map((ent) => (
                                  <div
                                    key={ent.id}
                                    className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between ${
                                      ent.batch === 'B1' ? 'bg-blue-50/70 border-blue-200 text-blue-900' : 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                                    }`}
                                  >
                                    <span className="font-bold truncate">{ent.label}</span>
                                    <span className="px-1 py-0.2 rounded font-mono font-bold bg-white/80 shrink-0">
                                      {ent.room || ent.batch}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        }

                        const ent = entries[0];
                        const isActivity = ent.entry_type === 'ACTIVITY';

                        return (
                          <td key={day} className="p-2 border-r border-slate-200 last:border-r-0 align-top">
                            <div
                              className={`h-full min-h-[72px] p-2 rounded-xl border flex flex-col justify-between text-xs ${
                                isActivity
                                  ? 'bg-slate-100/70 border-slate-200 text-slate-800'
                                  : 'bg-white border-slate-200 text-slate-900 hover:border-blue-300'
                              }`}
                            >
                              <div className="font-bold text-[11px] leading-tight">{ent.label}</div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100 mt-1">
                                <span>{ent.room || (isActivity ? 'Activity' : 'Class')}</span>
                                {ent.batch && <span className="font-bold text-blue-600">Batch {ent.batch}</span>}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: VIEW SUBJECT DETAIL */}
      {viewingSubject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                  {viewingSubject.vertical || 'PCC'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">{viewingSubject.name}</h3>
                  <p className="text-xs text-blue-600 font-mono font-bold">{viewingSubject.code}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingSubject(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Department & Track */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Department</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{viewingSubject.department}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Vertical Track</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{viewingSubject.vertical || 'PCC (Program Core Course)'}</div>
                </div>
              </div>

              {/* Contact Hours Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Contact Hours</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold">Theory</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.theory_hours || 0} Hours</div>
                  </div>
                  <div className="bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold">Tutorial</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.tutorial_hours || 0} Hours</div>
                  </div>
                  <div className="bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold">Practical</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.practical_hours || 0} Hours</div>
                  </div>
                </div>
              </div>

              {/* Credits Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Credits Allotted</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Theory</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.theory_credits || 0}</div>
                  </div>
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Tutorial</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.tutorial_credits || 0}</div>
                  </div>
                  <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-bold">Practical</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{viewingSubject.practical_credits || 0}</div>
                  </div>
                </div>
              </div>

              {/* Total Summary */}
              <div className="flex items-center justify-between p-3.5 bg-blue-600 text-white rounded-xl font-bold shadow-sm">
                <span>Total Course Credits</span>
                <span className="text-base">{viewingSubject.credits} Credits</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingSubject(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
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
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow">
                  {viewingClass.name}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">{viewingClass.department}</h3>
                  <p className="text-xs text-slate-500">
                    Class: <span className="font-bold text-blue-700">{viewingClass.name}</span> · Effective: <span className="font-bold text-slate-800">{viewingClass.effective_from || '15/06/2026'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingClass(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Quick Metrics */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Total Credits</div>
                  <div className="text-base font-bold text-blue-600 mt-0.5">{totalCurriculumCredits} Credits</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Curriculum Units</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">{subjects.length} Subjects</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Enrolled Students</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">{viewingClass.student_count}</div>
                </div>
              </div>

              {/* Assigned Subjects Roster */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 flex items-center justify-between text-xs">
                  <span>Assigned Curriculum Courses</span>
                  <span className="text-slate-400 font-normal">7 of 7 Courses linked</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {subjects.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="font-mono font-bold text-blue-700 mr-2">{s.code}</span>
                          <span className="font-medium text-slate-900">{s.name}</span>
                        </div>
                      </div>
                      <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border text-[11px]">
                        {s.credits} Credits
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  setViewingClass(null);
                  setActiveTab('timetable');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>View Timetable</span>
              </button>
              <button
                onClick={() => setViewingClass(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingSubject ? 'Edit Academic Course' : 'Register New Course'}
              </h3>
              <button
                onClick={() => setIsSubjectModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
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
                  <label className="block font-bold text-slate-700 mb-1">Course Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 24CSPC501C"
                    value={subjectForm.code}
                    onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vertical Track *</label>
                  <select
                    value={subjectForm.vertical}
                    onChange={(e) => setSubjectForm({ ...subjectForm, vertical: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="PCC">PCC (Program Core Course)</option>
                    <option value="PEC">PEC (Program Elective Course)</option>
                    <option value="MDM">MDM (Multidisciplinary Minor)</option>
                    <option value="OE">OE (Open Elective)</option>
                    <option value="VSEC">VSEC (Skill / Lab Course)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Course Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Theoretical Computer Science"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Abbreviation</label>
                  <input
                    type="text"
                    placeholder="e.g. TCS"
                    value={subjectForm.short_name || ''}
                    onChange={(e) => setSubjectForm({ ...subjectForm, short_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department *</label>
                  <input
                    type="text"
                    required
                    value={subjectForm.department}
                    onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Contact Hours */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Contact Hours (Theory / Tutorial / Practical)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Theory"
                    value={subjectForm.theory_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, theory_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Tutorial"
                    value={subjectForm.tutorial_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, tutorial_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Practical"
                    value={subjectForm.practical_hours}
                    onChange={(e) => setSubjectForm({ ...subjectForm, practical_hours: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                </div>
              </div>

              {/* Credit Allocations */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Credit Allotted (Theory / Tutorial / Practical)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Theory Cr"
                    value={subjectForm.theory_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, theory_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Tut Cr"
                    value={subjectForm.tutorial_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, tutorial_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Prac Cr"
                    value={subjectForm.practical_credits}
                    onChange={(e) => setSubjectForm({ ...subjectForm, practical_credits: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm"
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingClass ? 'Edit Class Section' : 'Create Class Section'}
              </h3>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
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
                <label className="block font-bold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TE-B"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Department *</label>
                <input
                  type="text"
                  required
                  value={classForm.department}
                  onChange={(e) => setClassForm({ ...classForm, department: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Effective From</label>
                  <input
                    type="text"
                    value={classForm.effective_from || '15/06/2026'}
                    onChange={(e) => setClassForm({ ...classForm, effective_from: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Section</label>
                  <input
                    type="text"
                    value={classForm.section}
                    onChange={(e) => setClassForm({ ...classForm, section: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm"
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

import mascotIcon from "../assets/atted-icon.png";
import React, { useState } from 'react';
import { LayoutDashboard, CheckSquare, Users, Calendar, BarChart2, Settings, X, LogOut, Camera, BookOpen, ShieldAlert, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { Avatar, IconButton, ConfirmDialog } from './ui';
import { useDialog } from './ui/useDialog';
interface SidebarProps { role?: string; userName?: string; onLogout?: () => void; activeTab: string; setActiveTab: (tab: string) => void; mobileOpen?: boolean; onCloseMobile?: () => void; }
export const Sidebar: React.FC<SidebarProps> = ({role = 'STUDENT', userName = '', onLogout, activeTab, setActiveTab, mobileOpen = false, onCloseMobile}) => {
 const [collapsed, setCollapsed] = useState(false); const [signOut, setSignOut] = useState(false);
 const [menuSearch, setMenuSearch] = useState('');
 const mobileRef = useDialog(mobileOpen, () => onCloseMobile?.());
 const academicItems = [
   {id:'classroom', label:'Classroom', icon:BookOpen},
   {id:'semester-results', label:'Semester marksheets', icon:BarChart2},
 ];
 const adminGroups = [
   {label:'Workspace',items:[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'students',label:'Students',icon:Users},{id:'users',label:'User accounts',icon:Users}]},
   {label:'Attendance',items:[{id:'attendance',label:'Attendance sessions',icon:CheckSquare},{id:'live',label:'Live attendance',icon:Camera},{id:'media',label:'Photo attendance',icon:ImageIcon},{id:'reports',label:'Attendance reports',icon:BarChart2}]},
   {label:'Academics',items:[{id:'timetable',label:'Timetable',icon:Calendar},{id:'subjects',label:'Courses & rooms',icon:BookOpen},...academicItems]},
   {label:'System',items:[{id:'audit',label:'Audit logs',icon:ShieldAlert},{id:'settings',label:'Settings',icon:Settings},{id:'recognition-test',label:'Recognition test',icon:Camera},{id:'anonymous-detection',label:'Anonymous detection',icon:ImageIcon}]},
 ];
 const groups = role === 'ADMIN' ? adminGroups : role === 'STUDENT' ? [{label: 'Overview', items: [{id:'my-attendance', label:'My Attendance', icon:CheckSquare},{id:'my-timetable',label:'My Timetable',icon:Calendar},{id:'classmates',label:'Class Space',icon:BookOpen}]}] : role === 'HOD' ? [{label:'Overview',items:[{id:'department',label:'Department',icon:LayoutDashboard},...academicItems]}] : [
 ...(role === 'FACULTY' ? [] : [{label:'Overview',items:[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard}]}]),
 {label:'Attendance',items:[{id:'live',label:'Live Attendance',icon:CheckSquare},{id:'attendance',label:'Attendance Sessions',icon:Calendar},{id:'media',label:'Photo Attendance',icon:ImageIcon}]},
 {label:'People',items:[{id:'students',label:'Students',icon:Users}]},
 {label:'Academics',items:[...(role === 'FACULTY' ? academicItems : []),{id:'timetable',label:'Timetable',icon:Calendar}]},
 {label:'Recognition tools',items:[...(role === 'FACULTY' ? [{id:'recognition-test',label:'Recognition Test',icon:Camera},{id:'anonymous-detection',label:'Anonymous Detection',icon:ImageIcon}] : [])]},
 {label:'Reports',items:[{id:'reports',label:'Reports',icon:BarChart2}]}];
 const content = (compact: boolean) => {
 const query = compact ? '' : menuSearch.trim().toLowerCase();
 const visible = groups.map(group => ({ ...group, items: group.items.filter(item => (group.label + ' ' + item.label).toLowerCase().includes(query)) })).filter(group => group.items.length);
 return <>
 <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4"><img src={mascotIcon} alt={compact ? "AttedDEL" : ""} width="48" height="48" className="h-10 w-10 shrink-0" />{!compact && <div className="min-w-0 flex-1"><p className="font-semibold tracking-tight">AttedDEL</p></div>}{mobileOpen && <IconButton label="Close sidebar" className="md:hidden" onClick={onCloseMobile}><X size={18}/></IconButton>}</div>
 {role === 'ADMIN' && !compact && <label className="relative mx-3 mt-3 block">
   <span className="sr-only">Find an admin page</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-text-muted" aria-hidden="true" />
   <input type="search" value={menuSearch} onChange={event => setMenuSearch(event.target.value)} placeholder="Find a page"
     className="min-h-11 w-full rounded-xl border border-border bg-surface-muted pl-9 pr-2 text-sm" />
 </label>}
 <nav aria-label="Main navigation" className="sidebar-nav flex-1 space-y-4 overflow-y-auto px-3 py-4">
   {!visible.length && <p role="status" className="px-3 text-sm text-text-muted">No matching pages.</p>}{visible.map(group => <div key={group.label}>{!compact && <p className="mb-2 px-3 text-xs font-medium text-text-muted">{group.label}</p>}<div className="space-y-1">{group.items.map(item => <button key={item.id} aria-label={item.label} title={compact ? item.label : undefined} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => { setMenuSearch(''); setActiveTab(item.id); }} className={`flex w-full items-center gap-3 rounded-xl border-l-2 px-3 text-left text-sm font-medium transition-colors ${activeTab === item.id ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-transparent text-text-muted hover:bg-surface-muted hover:text-text'} ${compact ? 'justify-center' : ''}`}><item.icon size={16} className="shrink-0"/>{!compact && <span>{item.label}</span>}</button>)}</div></div>)}</nav>
 <div className="shrink-0 border-t border-border p-3"><div className="flex items-center gap-2">{!compact && <><Avatar name={userName}/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{userName}</p><p className="text-xs text-text-muted">{role.charAt(0) + role.slice(1).toLowerCase()}</p></div></>}<IconButton label="Sign Out" onClick={() => setSignOut(true)}><LogOut size={17}/></IconButton></div><button className="mt-2 hidden w-full items-center justify-center gap-2 text-xs text-text-muted md:flex" aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{compact ? <PanelLeftOpen size={18}/> : <><PanelLeftClose size={18}/>Collapse sidebar</>}</button></div>
 </>;
 };
 return <><aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex ${collapsed ? 'w-20' : 'w-[248px]'}`}>{content(collapsed)}</aside>{mobileOpen && <div className="fixed inset-0 z-50 md:hidden"><div className="absolute inset-0 bg-black/50" onClick={onCloseMobile}/><div ref={mobileRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="relative flex h-full w-[min(300px,90vw)] flex-col bg-surface shadow-xl">{content(false)}</div></div>}<ConfirmDialog isOpen={signOut} onClose={() => setSignOut(false)} onConfirm={() => {setSignOut(false); onLogout?.();}} title="Sign out?" description="You can sign back in to continue managing attendance." confirmLabel="Sign out"/></>;
};

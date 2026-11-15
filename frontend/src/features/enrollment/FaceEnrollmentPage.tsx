import { useEffect, useRef, useState } from 'react';
import { WebcamPanel, FrameResult } from '../../components/camera/WebcamPanel';
import { apiClient } from '../../services/api';
import { fetchStudents } from '../../services/studentApi';
import { Student } from '../../types/student';
import { formatApiErrorMessage } from '../../utils/apiError';

type Enrollment = {required_poses:string[];completed_poses:string[];hints:Record<string,string>;complete:boolean};
export function FaceEnrollmentPage({initialStudentId,onNavigate}:{initialStudentId?:string;onNavigate?:(tab:string)=>void}) {
 const [students,setStudents]=useState<Student[]>([]),[sid,setSid]=useState(initialStudentId||''),[status,setStatus]=useState<Enrollment|null>(null),[pose,setPose]=useState('FRONT'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[automatic,setAutomatic]=useState(true),[search,setSearch]=useState('');
 const context=useRef({sid,pose}); context.current={sid,pose};
 const stable=useRef(0),lastPose=useRef(''),lastBlob=useRef<{blob:Blob;studentId:string;pose:string}|null>(null),saving=useRef(false);
 useEffect(()=>{let active=true;fetchStudents({limit:100,search}).then(r=>{if(active){setStudents(r.items);if(!sid&&r.items.length)setSid(r.items[0].id);}}).catch(e=>setError(formatApiErrorMessage(e,'Unable to load students.')));return()=>{active=false;};},[search]);
 useEffect(()=>{
  let active=true;
  setStatus(null);stable.current=0;lastBlob.current=null;setError('');
  if(sid)apiClient.get(`/students/${sid}/enroll/status`).then(r=>{
   if(!active)return;
   setStatus(r.data);setPose(r.data.required_poses.find((p:string)=>!r.data.completed_poses.includes(p))||r.data.required_poses[0]);
  }).catch(e=>{if(active)setError(formatApiErrorMessage(e,'Unable to load enrollment.'));});
  return()=>{active=false;};
 },[sid]);
 useEffect(()=>{lastBlob.current=null;stable.current=0;},[sid,pose]);
 const save=async(blob:Blob)=>{if(saving.current||!sid||context.current.sid!==sid||context.current.pose!==pose)return;saving.current=true;setBusy(true);setError('');const form=new FormData();form.append('file',blob,'face.jpg');form.append('pose_type',pose);
 try{const r=await apiClient.post(`/students/${sid}/enroll`,form);if(context.current.sid!==sid||context.current.pose!==pose)return;if(!r.data.success)throw new Error(r.data.message);setStatus(r.data);setPose(r.data.required_poses.find((p:string)=>!r.data.completed_poses.includes(p))||pose);stable.current=0;}
 catch(e){if(context.current.sid===sid&&context.current.pose===pose)setError(formatApiErrorMessage(e,'Unable to save sample.'));}finally{saving.current=false;setBusy(false);}};
 const frame=async(blob:Blob,signal:AbortSignal):Promise<FrameResult>=>{if(!sid||!status||saving.current)return {};lastBlob.current={blob,studentId:sid,pose};const form=new FormData();form.append('file',blob,'check.jpg');form.append('pose_type',pose);const r=await apiClient.post(`/students/${sid}/enroll/check`,form,{signal});const d=r.data;
 if(signal.aborted||context.current.sid!==sid||context.current.pose!==pose)return {};
 if(d.valid){if(lastPose.current!==pose||!stable.current){stable.current=performance.now();lastPose.current=pose;}else if(automatic&&performance.now()-stable.current>=1000&&!status.completed_poses.includes(pose)){await save(blob);}}else stable.current=0;
 return {message:`${status.hints[pose]} — ${d.hint}${d.blur!=null?` · Sharpness ${d.blur.toFixed(0)} · Brightness ${d.brightness.toFixed(0)}`:''}`,boxes:d.bbox?[{bbox:d.bbox,label:d.valid?'Hold still':d.hint,color:d.valid?'#16a34a':'#d97706'}]:[]};};
 return <div className="space-y-5"><header><h1 className="text-2xl font-bold">Guided face enrollment</h1><p className="text-slate-500">One person, good lighting, seven guided samples. Each sample is validated on the server.</p></header>{error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}<div className="flex flex-wrap gap-3"><label>Find student<input className="ml-2 rounded border p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Student<select disabled={busy} className="ml-2 rounded border p-2" value={sid} onChange={e=>setSid(e.target.value)}><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.roll_number}</option>)}</select></label></div>{!students.length&&<p>No students found. Create a student in Students first.</p>}
 {status&&<><div className="flex flex-wrap gap-2">{status.required_poses.map((p,i)=><button key={p} disabled={busy} onClick={()=>{setPose(p);stable.current=0;}} className={`rounded-full border px-3 py-2 text-sm ${pose===p?'border-blue-600 bg-blue-50':''} ${status.completed_poses.includes(p)?'text-green-700':''}`}>{status.completed_poses.includes(p)?'✓':i+1} {p.replace(/_/g,' ')}{status.completed_poses.includes(p)?' · Retake':''}</button>)}</div><p>{status.completed_poses.length}/{status.required_poses.length} poses saved. {status.complete?'Enrollment complete. Try Recognition Test.':status.hints[pose]}</p><WebcamPanel key={sid} onFrame={frame}/><div className="flex gap-4"><label><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/> Auto-capture after 1 second of valid pose</label><button className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" disabled={busy} onClick={()=>{if(lastBlob.current?.studentId===sid&&lastBlob.current.pose===pose)void save(lastBlob.current.blob);else setError('Start the camera before capturing.');}}>Capture / retake current pose</button></div><label className="block">Or upload a real image for this pose<input className="ml-2" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e=>{if(e.target.files?.[0])void save(e.target.files[0]);e.target.value='';}}/></label>{status.complete&&<button className="rounded bg-green-700 p-3 text-white" onClick={()=>onNavigate?.('recognition-test')}>Open Recognition Test</button>}</>}
 </div>;
}

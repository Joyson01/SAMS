import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatApiErrorMessage } from '../../utils/apiError';

export type FaceBox = { bbox: number[]; label: string; color: string };
export type FrameResult = { boxes?: FaceBox[]; message?: string; valid?: boolean; quality?: { blur?: number; brightness?: number } };
export function WebcamPanel({ onFrame, onSample, onCapture, disabled=false, compact=false, captureLabel="Capture photo", captureBusy=false, onCameraChange, cameraOptions, secondaryAction, frameInterval=250, showGuide=true }: {onFrame?:(blob:Blob, signal:AbortSignal)=>Promise<FrameResult>;onSample?:(blob:Blob)=>void;onCapture?:(blob:Blob)=>void;disabled?:boolean;compact?:boolean;captureLabel?:string;captureBusy?:boolean;onCameraChange?:()=>void;cameraOptions?:ReactNode;secondaryAction?:ReactNode;frameInterval?:number;showGuide?:boolean}) {
 const video=useRef<HTMLVideoElement>(null), overlay=useRef<HTMLCanvasElement>(null), callback=useRef(onFrame), sample=useRef(onSample);
 const [captureReady, setCaptureReady] = useState(false);
 const analyzesFrames = Boolean(onFrame || onSample);
 const capture = () => {
  const frame = video.current;
  if (!frame || !frame.videoWidth || !frame.videoHeight) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(960, frame.videoWidth);
  canvas.height = Math.round(frame.videoHeight * canvas.width / frame.videoWidth);
  canvas.getContext('2d')?.drawImage(frame, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => { if (blob) onCapture?.(blob); }, 'image/jpeg', 0.85);
 };
 callback.current=onFrame; sample.current=onSample;
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[running,setRunning]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[fps,setFps]=useState(0),[quality,setQuality]=useState<FrameResult['quality']>(),[valid,setValid]=useState(false);
 useEffect(()=>{
  setCaptureReady(false);
  if(!running||disabled)return;
  let stopped=false,stream:MediaStream|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const canvas=document.createElement('canvas');
  let previous=performance.now();
  const tick=async()=>{
   if(stopped)return;
   const v=video.current;
   if(!document.hidden&&v&&v.readyState>=2&&v.videoWidth){
    canvas.width=Math.min(960,v.videoWidth);canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);
    canvas.getContext('2d')!.drawImage(v,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.7));
    if(blob&&!stopped){
     try{
      sample.current?.(blob);
      const result=await callback.current?.(blob,controller.signal) ?? {};
      if(stopped)return;
      setMessage(result.message||'');setQuality(result.quality);setValid(result.valid===true);setError('');
      const now=performance.now();setFps(1000/(now-previous));previous=now;
      const o=overlay.current;
      if(o){o.width=canvas.width;o.height=canvas.height;const ctx=o.getContext('2d')!;ctx.clearRect(0,0,o.width,o.height);ctx.font='16px sans-serif';ctx.lineWidth=3;
       for(const box of result.boxes||[]){const [x1,y1,x2,y2]=box.bbox;const x=o.width-x2;ctx.strokeStyle=box.color;ctx.fillStyle=box.color;ctx.strokeRect(x,y1,x2-x1,y2-y1);let label=box.label;while(label.length>1&&ctx.measureText(label).width>o.width-16)label=label.slice(0,-2)+'…';const textWidth=ctx.measureText(label).width;const labelX=Math.max(0,Math.min(x,o.width-textWidth-10));const labelY=Math.max(0,Math.min(y1-24,o.height-24));ctx.fillRect(labelX,labelY,textWidth+10,24);ctx.fillStyle='white';ctx.fillText(label,labelX+5,labelY+18);}
      }
     }catch(e){if(!stopped&&!controller.signal.aborted)setError(formatApiErrorMessage(e,'Frame analysis failed.'));}
    }
   }
   if(!stopped)timer=setTimeout(tick,frameInterval);
  };
  (async()=>{
   try{
    if(!window.isSecureContext)throw new Error('Camera requires HTTPS or localhost. An HTTP LAN address cannot use the webcam.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser has no camera API. Use a current browser on localhost or HTTPS.');
    stream=await navigator.mediaDevices.getUserMedia({video:device?{deviceId:{exact:device},width:{ideal:960}}:{facingMode:'user',width:{ideal:960}},audio:false});
    if(stopped){stream.getTracks().forEach(t=>t.stop());return;}
    setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));
    if(video.current){video.current.srcObject=stream;await video.current.play();}
    if(stopped)return;
    setCaptureReady(true);setError('');if(analyzesFrames)void tick();
   }catch(e){if(stopped)return;const name=(e as DOMException).name;setError(name==='NotAllowedError'?'Camera permission denied. Allow camera access in your browser settings.':name==='NotFoundError'?'No camera found. Connect a webcam and retry.':name==='NotReadableError'?'Camera is in use. Close other camera apps and retry.':(e as Error).message);setRunning(false);}
  })();
  return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());if(video.current)video.current.srcObject=null;};
 },[running,device,disabled,analyzesFrames,frameInterval]);
 const deviceControl = <label className="min-w-0 flex-1 text-xs font-medium text-text-muted">Camera device<select className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text" value={device} onChange={e=>{onCameraChange?.();setDevice(e.target.value);}}><option value="">Built-in / default</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Camera'}</option>)}</select></label>;
 const cameraToggle = <button type="button" disabled={disabled}
   className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${cameraOptions && running ? 'border border-border bg-surface text-text' : 'bg-primary text-primary-foreground'}`}
   onClick={()=>{const canvas=overlay.current;canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setError('');setMessage('');setQuality(undefined);setValid(false);onCameraChange?.();setRunning(!running);}}>
   {running?'Stop camera':error?'Retry camera':'Start camera'}
 </button>;
 const captureButton = onCapture && running && <button type="button" disabled={disabled||!captureReady||captureBusy}
   className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${cameraOptions ? 'bg-primary text-primary-foreground' : 'border border-border'}`}
   onClick={capture}>{captureBusy ? 'Working…' : captureLabel}</button>;
 return <section className="space-y-3">
 {!cameraOptions && <div className="flex flex-wrap items-end gap-3">{cameraToggle}{secondaryAction}{deviceControl}</div>}
 {(!compact || running || cameraOptions) && <div className={`relative overflow-hidden rounded-xl ${cameraOptions && !running ? 'border border-dashed border-border bg-surface-muted' : 'bg-[#020617]'}`}>
   <video ref={video} aria-label="Mirrored camera preview" playsInline muted
     className={`block w-full -scale-x-100 ${running ? 'h-auto' : cameraOptions ? 'h-36' : 'aspect-video h-auto'}`}/>
   <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full"/>
   {running
     ? showGuide && <div className={`pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed ${valid?'border-green-400':'border-white/50'}`}/>
     : <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center ${cameraOptions ? 'text-text' : 'text-white'}`}>
       <span className="text-sm font-semibold">Camera is off</span>
       <span className={`max-w-xs text-xs leading-relaxed ${cameraOptions ? 'text-text-muted' : 'text-[#cbd5e1]'}`}>
         {cameraOptions ? 'Start your camera or upload a JPEG photo.' : 'Start your camera when ready. Your browser will ask for permission.'}
       </span>
     </div>}
   {analyzesFrames&&!compact&&<span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white">{running?fps.toFixed(1):'0'} FPS · mirrored</span>}
 </div>}
 {cameraOptions
   ? <div className="flex flex-wrap items-center gap-2">{captureButton}{cameraToggle}{secondaryAction}</div>
   : captureButton}
 {message&&(!compact||running)&&<p role="status" className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-text">{message}</p>}{error&&<p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
 {cameraOptions && <details className="rounded-xl border border-border px-3">
   <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-text-muted">Camera settings</summary>
   <div className="space-y-3 pb-3">{deviceControl}{cameraOptions}</div>
 </details>}
 {quality&&<dl className="grid grid-cols-2 gap-3">{[['Sharpness',quality.blur],['Brightness',quality.brightness]].map(([label,value])=><div key={label} className="rounded-lg bg-surface-muted p-3"><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-1 font-mono text-sm text-text">{typeof value==='number'?value.toFixed(0):'—'}</dd></div>)}</dl>}
 {analyzesFrames&&!compact&&<p className="text-xs leading-relaxed text-text-muted">Frames pause while this tab is hidden. Stop camera to release it.</p>}</section>;
}

import { useEffect, useRef, useState } from 'react';
import { formatApiErrorMessage } from '../../utils/apiError';

export type FaceBox = { bbox: number[]; label: string; color: string };
export type FrameResult = { boxes?: FaceBox[]; message?: string };
export function WebcamPanel({ onFrame, onSample, disabled=false }: {onFrame:(blob:Blob, signal:AbortSignal)=>Promise<FrameResult>;onSample?:(blob:Blob)=>void;disabled?:boolean}) {
 const video=useRef<HTMLVideoElement>(null), overlay=useRef<HTMLCanvasElement>(null), callback=useRef(onFrame), sample=useRef(onSample);
 callback.current=onFrame; sample.current=onSample;
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[running,setRunning]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[fps,setFps]=useState(0);
 useEffect(()=>{
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
      const result=await callback.current(blob,controller.signal);
      if(stopped)return;
      setMessage(result.message||'');
      const now=performance.now();setFps(1000/(now-previous));previous=now;
      const o=overlay.current;
      if(o){o.width=canvas.width;o.height=canvas.height;const ctx=o.getContext('2d')!;ctx.clearRect(0,0,o.width,o.height);ctx.font='16px sans-serif';ctx.lineWidth=3;
       for(const box of result.boxes||[]){const [x1,y1,x2,y2]=box.bbox;const x=o.width-x2;ctx.strokeStyle=box.color;ctx.fillStyle=box.color;ctx.strokeRect(x,y1,x2-x1,y2-y1);const textWidth=ctx.measureText(box.label).width;ctx.fillRect(Math.max(0,x),Math.max(0,y1-24),textWidth+10,24);ctx.fillStyle='white';ctx.fillText(box.label,Math.max(0,x)+5,Math.max(18,y1-6));}
      }
     }catch(e){if(!stopped&&!controller.signal.aborted)setError(formatApiErrorMessage(e,'Frame analysis failed.'));}
    }
   }
   if(!stopped)timer=setTimeout(tick,250);
  };
  (async()=>{
   try{
    if(!window.isSecureContext)throw new Error('Camera requires HTTPS or localhost. An HTTP LAN address cannot use the webcam.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser has no camera API. Use a current browser on localhost or HTTPS.');
    stream=await navigator.mediaDevices.getUserMedia({video:device?{deviceId:{exact:device},width:{ideal:960}}:{facingMode:'user',width:{ideal:960}},audio:false});
    if(stopped){stream.getTracks().forEach(t=>t.stop());return;}
    setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));
    if(video.current){video.current.srcObject=stream;await video.current.play();}
    setError('');void tick();
   }catch(e){if(stopped)return;const name=(e as DOMException).name;setError(name==='NotAllowedError'?'Camera permission denied. Allow camera access in your browser settings.':name==='NotFoundError'?'No camera found. Connect a webcam and retry.':name==='NotReadableError'?'Camera is in use. Close other camera apps and retry.':(e as Error).message);setRunning(false);}
  })();
  return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());if(video.current)video.current.srcObject=null;};
 },[running,device,disabled]);
 return <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><button type="button" disabled={disabled} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={()=>{setError('');setRunning(!running);}}>{running?'Stop camera':'Start camera'}</button><label className="text-sm">Camera<select className="ml-2 rounded border p-2" value={device} onChange={e=>setDevice(e.target.value)}><option value="">Built-in / default</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Camera'}</option>)}</select></label><span className="text-sm text-slate-500">{running?fps.toFixed(1):'0'} FPS · mirrored preview</span></div>
 <div className="relative overflow-hidden rounded-xl bg-slate-950"><video ref={video} playsInline muted className="block h-auto w-full -scale-x-100"/><canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full"/><div className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-white/30"/></div>
 {message&&<p role="status" className="rounded bg-blue-50 p-3 text-blue-900">{message}</p>}{error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
 <p className="text-xs text-slate-500">Frames pause while this tab is hidden. Stop camera to release it.</p></section>;
}

import React, { createContext, useCallback, useContext, useRef, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
type ToastMessage = {id: number; message: string; variant: 'success' | 'error' | 'info'};
const ToastContext = createContext<(message: string, variant?: ToastMessage['variant']) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({children}: {children: React.ReactNode}) {
 const [messages, setMessages] = useState<ToastMessage[]>([]); const timers = useRef<ReturnType<typeof setTimeout>[]>([]); const sequence = useRef(0);
 useEffect(() => () => timers.current.forEach(clearTimeout), []);
 const toast = useCallback((message: string, variant: ToastMessage['variant'] = 'success') => {const id = ++sequence.current; setMessages(items => [...items, {id,message,variant}]); timers.current.push(setTimeout(() => setMessages(items => items.filter(item => item.id !== id)), 6000));}, []);
 return <ToastContext.Provider value={toast}>{children}<div aria-live="polite" aria-atomic="false" className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col gap-2">{messages.map(item => <div key={item.id} role="status" className="flex w-96 max-w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-xl">{item.variant === 'error' ? <AlertCircle className="shrink-0 text-danger"/> : <CheckCircle2 className="shrink-0 text-success"/>}<span className="flex-1 text-sm">{item.message}</span><button aria-label="Dismiss notification" onClick={() => setMessages(items => items.filter(message => message.id !== item.id))}><X size={18}/></button></div>)}</div></ToastContext.Provider>;
}

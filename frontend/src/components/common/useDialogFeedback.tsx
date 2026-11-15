import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../ui';

/** UI-only replacement for blocking browser prompts. Callers retain their existing mutations. */
export function useDialogFeedback() {
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmAction = (text: string) => new Promise<boolean>(resolve => {
    resolver.current = resolve;
    setConfirmation(text);
  });
  const close = (confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setConfirmation('');
  };
  useEffect(() => () => resolver.current?.(false), []);
  const feedback = <>
    {message && <div role="status" className="fixed bottom-5 left-5 right-5 z-[70] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 text-sm text-text shadow-xl"><p>{message}</p><Button size="sm" variant="ghost" onClick={() => setMessage('')}>Dismiss</Button></div>}
    <Modal isOpen={!!confirmation} onClose={() => close(false)} title="Confirm this action" footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button variant="danger" onClick={() => close(true)}>Confirm</Button></>}><p className="text-sm leading-6 text-text-muted">{confirmation}</p></Modal>
  </>;
  return { confirmAction, notify: setMessage, feedback };
}

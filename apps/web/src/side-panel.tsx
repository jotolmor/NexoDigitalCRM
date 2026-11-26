import { useEffect, useRef, type ReactNode } from 'react';
import './side-panel.css';

/** Right-hand panel for create and edit forms: focus moves in on open, Escape closes, focus returns to the opener. */
export function SidePanel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <aside ref={panel} className="side-panel" role="dialog" aria-modal="false" aria-label={label}>
    {children}
    <button type="button" className="side-panel-close" onClick={onClose}>Cerrar</button>
  </aside>;
}

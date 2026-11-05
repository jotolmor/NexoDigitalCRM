import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal supplies focus trapping, background inertness and focus restoration. */
export function EditPopover({ title, onClose, children, open = true, busy = false, caption = 'Actualizar información', closeLabel = 'Cerrar edición' }: {
  title: string; onClose: () => void; children: ReactNode; open?: boolean; busy?: boolean; caption?: string; closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close(); document.body.style.overflow = previousOverflow;
      queueMicrotask(() => { if (opener?.isConnected) opener.focus(); });
    };
  }, [open]);
  useEffect(() => { dialog.current?.querySelector('button')?.focus(); }, [title]);
  if (!open) return <>{children}</>;
  return createPortal(<dialog ref={dialog} className="workspace-edit-dialog management" aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className="edit-dialog-heading"><div><p className="eyebrow">{caption}</p><h2 id={titleId}>{title}</h2></div>
      <button type="button" className="secondary edit-dialog-close" aria-label={closeLabel} disabled={busy} onClick={onClose}>×</button>
    </header>
    <div className="edit-dialog-body">{children}</div>
  </dialog>, document.body);
}

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import './dashboard-navigation.css';
import { EditPopover } from './edit-popover';

export type WorkspaceView = 'Asistente' | 'Citas' | 'Pacientes' | 'Profesionales' | 'Servicios' | 'Tratamientos' | 'Seguimiento' | 'Horarios';

export type WorkspaceDestination = WorkspaceView | `page:${string}`;

const icons: Record<WorkspaceView | 'Salir' | 'Ubicación' | 'Editar', ReactNode> = {
  Asistente: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /><path d="m20 3 .5 1.5L22 5l-1.5.5L20 7l-.5-1.5L18 5l1.5-.5L20 3Z" /></>,
  Citas: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01" /></>,
  Pacientes: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2" /></>,
  Profesionales: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3m-11-9 4 4 4-4m-4 4v5m5-4v4m-2-2h4" /></>,
  Servicios: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a23 23 0 0 0 18 0m-9 0v4" /></>,
  Tratamientos: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1m-3 5v6m-3-3h6m-6 6h6" /></>,
  Seguimiento: <><path d="M3 12a9 9 0 1 1 2.6 6.4M3 17v4h4m-4 0 3-3m6-11v5l3 2" /></>,
  Horarios: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  Salir: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-13 5 5-5 5m-8-5h13" /></>,
  Ubicación: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  Editar: <><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2" /></>
};

function NavigationIcon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}

type Props = {
  items: { view: WorkspaceDestination; label: string }[];
  active?: WorkspaceDestination;
  homeView?: WorkspaceDestination;
  developmentPanel?: ReactNode;
  date: string;
  isToday: boolean;
  address: string;
  onSaveAddress: (address: string) => Promise<void>;
  onSelect: (view: WorkspaceDestination) => void;
  onLogout: () => void;
};

export function DashboardNavigation({ items, active, homeView = 'Asistente', developmentPanel, date, isToday, address, onSaveAddress, onSelect, onLogout }: Props) {
  const location = useRef<HTMLDetailsElement>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState(address);
  const [addressError, setAddressError] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAddress) return;
    const value = addressDraft.trim();
    if (!value) { setAddressError('Indica la dirección del negocio.'); return; }
    setAddressError(''); setSavingAddress(true);
    try { await onSaveAddress(value); if (location.current) location.current.open = false; }
    catch (error) { setAddressError(error instanceof Error ? error.message : 'No se pudo guardar la dirección.'); }
    finally { setSavingAddress(false); }
  }
  const formatted = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T12:00:00Z'));
  const dateLabel = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return <div className="workspace-top">
    <a className="workspace-skip" href="#workspace-content">Ir al contenido</a>
    <div className="workspace-top-inner">
      <header className="workspace-header">
        <button type="button" className="workspace-brand" onClick={() => onSelect(homeView)} aria-label={homeView === 'Asistente' ? 'CrmNexodigitalAssist · Ir al asistente' : 'CrmNexodigitalAssist · Ir al inicio'}>
          <img src="/branding/crm-nexodigital-assist-light.svg" width="272" height="92" alt="CrmNexodigitalAssist" />
        </button>
        <div className="workspace-context">
          <div className="workspace-date" aria-live="polite" aria-atomic="true">
          <span className="workspace-date-icon"><NavigationIcon name="Citas" /></span>
          <div><span className="workspace-date-caption">{isToday ? 'Actividad de hoy' : 'Día seleccionado'}</span><time dateTime={date}>{dateLabel}</time></div>
          </div>
          <details className="workspace-location" ref={location} onToggle={event => {
            setAddressOpen(event.currentTarget.open);
            if (event.currentTarget.open) { setAddressDraft(address); setAddressError(''); }
          }} onKeyDown={event => {
            if (event.key === 'Escape' && !savingAddress && location.current) { location.current.open = false; location.current.querySelector('summary')?.focus(); }
          }}>
            <summary title={address || 'Añadir dirección'}>
              <span className="workspace-date-icon"><NavigationIcon name="Ubicación" /></span>
              <span className="workspace-location-copy"><span className="workspace-date-caption">Ubicación</span><span className="workspace-location-value">{address || 'Añadir dirección'}</span></span>
              <span className="workspace-location-edit"><NavigationIcon name="Editar" /></span>
            </summary>
            <EditPopover open={addressOpen} busy={savingAddress} title="Editar ubicación" onClose={() => { setAddressOpen(false); if (location.current) location.current.open = false; }}><form className="workspace-location-form" onSubmit={saveAddress} aria-busy={savingAddress}>
              <label>Dirección del negocio<input value={addressDraft} onChange={event => setAddressDraft(event.target.value)} autoComplete="street-address" placeholder="Calle, número, código postal y localidad" required maxLength={300} disabled={savingAddress} /></label>
              {addressError && <p className="error" role="alert">{addressError}</p>}
              <div><button type="button" className="secondary" disabled={savingAddress} onClick={() => { if (location.current) location.current.open = false; }}>Cancelar</button><button type="submit" className="primary" disabled={savingAddress}>{savingAddress ? 'Guardando…' : 'Guardar dirección'}</button></div>
            </form></EditPopover>
          </details>
        </div>
        <button type="button" className="logout workspace-logout" onClick={onLogout}><NavigationIcon name="Salir" /><span>Cerrar sesión</span></button>
      </header>
      {developmentPanel}
      <nav className={items.length === 8 ? 'workspace-nav' : items.length === 6 ? 'workspace-nav workspace-nav-six' : 'workspace-nav workspace-nav-custom'} aria-label="Navegación principal">
        {items.map(({ view, label }) => <button
          key={view} type="button" className={'workspace-nav-card' + (active === view ? ' is-active' : '')}
          aria-current={active === view ? 'page' : undefined} onClick={() => onSelect(view)}
        >
          <span className="workspace-nav-icon">{view.startsWith('page:') ? <NavigationIcon name="Tratamientos" /> : <NavigationIcon name={view as WorkspaceView} />}</span>
          <span className="workspace-nav-label">{label}</span>
          {active === view && <span className="workspace-nav-indicator" aria-hidden="true" />}
        </button>)}
      </nav>
    </div>
  </div>;
}

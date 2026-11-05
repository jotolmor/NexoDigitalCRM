import type { ReactNode } from 'react';
import './dashboard-navigation.css';

export type WorkspaceView = 'Asistente' | 'Resumen' | 'Agenda' | 'Pacientes' | 'Profesionales' | 'Servicios' | 'Tratamientos' | 'Seguimiento' | 'Horarios';

const icons: Record<WorkspaceView | 'Salir' | 'Clínica', ReactNode> = {
  Asistente: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /><path d="m20 3 .5 1.5L22 5l-1.5.5L20 7l-.5-1.5L18 5l1.5-.5L20 3Z" /></>,
  Resumen: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /></>,
  Agenda: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01" /></>,
  Pacientes: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2" /></>,
  Profesionales: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3m-11-9 4 4 4-4m-4 4v5m5-4v4m-2-2h4" /></>,
  Servicios: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a23 23 0 0 0 18 0m-9 0v4" /></>,
  Tratamientos: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1m-3 5v6m-3-3h6m-6 6h6" /></>,
  Seguimiento: <><path d="M3 12a9 9 0 1 1 2.6 6.4M3 17v4h4m-4 0 3-3m6-11v5l3 2" /></>,
  Horarios: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  Salir: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-13 5 5-5 5m-8-5h13" /></>,
  Clínica: <><path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15M9 21v-4h6v4M9 9h6m-3-3v6M2 21h20" /></>
};

function NavigationIcon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}

type Props = {
  items: { view: WorkspaceView; label: string }[];
  active: WorkspaceView;
  clinicName: string;
  onSelect: (view: WorkspaceView) => void;
  onLogout: () => void;
};

export function DashboardNavigation({ items, active, clinicName, onSelect, onLogout }: Props) {
  return <div className="workspace-top">
    <a className="workspace-skip" href="#workspace-content">Ir al contenido</a>
    <div className="workspace-top-inner">
      <header className="workspace-header">
        <button type="button" className="workspace-brand" onClick={() => onSelect('Asistente')} aria-label="CrmNexodigitalAssist · Ir al asistente">
          <img src="/branding/crm-nexodigital-assist-light.svg" width="272" height="92" alt="CrmNexodigitalAssist" />
        </button>
        <div className="workspace-account">
          {clinicName && <span className="workspace-clinic"><NavigationIcon name="Clínica" /><span>{clinicName}</span></span>}
          <button type="button" className="logout workspace-logout" onClick={onLogout}><NavigationIcon name="Salir" /><span>Cerrar sesión</span></button>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="Navegación principal">
        {items.map(({ view, label }) => <button
          key={view} type="button" className={'workspace-nav-card' + (active === view ? ' is-active' : '')}
          aria-current={active === view ? 'page' : undefined} onClick={() => onSelect(view)}
        >
          <span className="workspace-nav-icon"><NavigationIcon name={view} /></span>
          <span className="workspace-nav-label">{label}</span>
          {active === view && <span className="workspace-nav-indicator" aria-hidden="true" />}
        </button>)}
      </nav>
    </div>
  </div>;
}

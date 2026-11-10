import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicDateKey, type DayAppointment } from './overview-data';
import { EditPopover } from './edit-popover';
import './appointment-search.css';

type Appointment = DayAppointment & { patient: DayAppointment['patient'] & { dni?: string | null; phone?: string | null } };
const states: Record<string, string> = { SCHEDULED: 'Programada', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió' };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
type Filters = { patient: string; professional: string; date: string; status: string };

export function AppointmentSearch({ scope, timezone, load, onSelectDate }: {
  scope: string[]; timezone: string; load: (path: string) => Promise<any>; onSelectDate: (date: string) => void;
}) {
  const [filters, setFilters] = useState<Filters | null>(null);
  const [open, setOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const professionals = useQuery<{ id: string; firstName: string; lastName: string }[]>({ queryKey: ['professionals-agenda'], queryFn: () => load('/professionals') });
  const appointments = useQuery<Appointment[]>({ queryKey: ['appointments', ...scope], queryFn: () => load('/appointments'), enabled: filters !== null });
  const results = (appointments.data ?? []).filter(item => {
    if (!filters) return false;
    const term = normalized(filters.patient);
    const name = normalized(`${item.patient.firstName} ${item.patient.lastName}`);
    const compact = term.replace(/[^a-z0-9]/g, '');
    const matchesPatient = !term || term.split(/\s+/).every(word => name.includes(word))
      || Boolean(compact && normalized(item.patient.dni ?? '').replace(/[^a-z0-9]/g, '').includes(compact))
      || Boolean(/^[+\d\s().-]+$/.test(term) && /\d/.test(term) && (item.patient.phone ?? '').replace(/\D/g, '').includes(term.replace(/\D/g, '')));
    return matchesPatient && (!filters.professional || item.professional.id === filters.professional)
      && (!filters.date || clinicDateKey(new Date(item.startsAt), timezone) === filters.date)
      && (!filters.status || item.status === filters.status);
  }).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFilters({ patient: String(data.get('patient') ?? '').trim(), professional: String(data.get('professional') ?? ''), date: String(data.get('date') ?? ''), status: String(data.get('status') ?? '') });
    setOpen(true);
    void appointments.refetch();
  }
  function showDay(appointment: Appointment) {
    onSelectDate(clinicDateKey(new Date(appointment.startsAt), timezone));
    setOpen(false);
    requestAnimationFrame(() => calendarRef.current?.nextElementSibling?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  return <div ref={calendarRef} className="appointment-search-wrap">
    <section className="panel appointment-search-panel" aria-label="Buscar citas">
      <div className="appointment-search-heading"><p className="eyebrow">Consulta la agenda</p><h2>Buscar citas</h2><p>Encuentra una cita por paciente, profesional, fecha o estado.</p></div>
      <form className="appointment-search-form" onSubmit={search}>
        <label>Paciente<input name="patient" type="search" placeholder="Nombre, apellidos, DNI o teléfono" maxLength={150} /></label>
        <label>Profesional<select name="professional" disabled={professionals.isLoading}><option value="">Todos los profesionales</option>{professionals.data?.map(person => <option value={person.id} key={person.id}>{person.firstName} {person.lastName}</option>)}</select></label>
        <label>Fecha<input name="date" type="date" /></label>
        <label>Estado<select name="status"><option value="">Todos los estados</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="appointment-search-actions"><button className="primary">Buscar citas</button><button type="reset" className="secondary" onClick={() => { setFilters(null); setOpen(false); }}>Limpiar</button></div>
      </form>
      {professionals.isError && <p role="alert" className="error">No se pudo cargar el listado de profesionales. Puedes buscar con los demás campos.</p>}
    </section>
    {open && <EditPopover title="Resultados de citas" caption="Búsqueda de agenda" closeLabel="Cerrar resultados" onClose={() => setOpen(false)}>
      {appointments.isFetching ? <p role="status">Buscando citas…</p> : appointments.isError ? <div role="alert"><p>No se pudieron consultar las citas.</p><button type="button" className="secondary" onClick={() => void appointments.refetch()}>Reintentar</button></div> : <>
        <p role="status">{results.length} {results.length === 1 ? 'cita encontrada' : 'citas encontradas'}</p>
        {!results.length ? <p>No hay citas que coincidan con estos filtros.</p> : <ul className="appointment-search-results">{results.map(item => <li className="panel" key={item.id}>
          <b>{item.patient.firstName} {item.patient.lastName}</b><span>{item.professional.firstName} {item.professional.lastName}</span><span>{item.service?.name ?? 'Consulta'}</span>
          <time dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleString('es-ES', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}</time><span>{states[item.status] ?? item.status}</span>
          <button type="button" className="secondary" onClick={() => showDay(item)}>Ver día en calendario</button>
        </li>)}</ul>}
      </>}
    </EditPopover>}
  </div>;
}

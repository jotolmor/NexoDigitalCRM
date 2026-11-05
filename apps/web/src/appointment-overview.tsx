import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { appointmentRoster, DayAppointment } from './overview-data';
import { AppointmentPersonCards, type PersonSubject } from './appointment-person-cards';
import './appointment-overview.css';

type Props = {
  session: { user: { id: string; tenantId: string; clinicId?: string | null } };
  timezone: string;
  load: (path: string) => Promise<any>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
};
type DayData = { date: string; timezone: string; appointments: DayAppointment[] };
type CalendarDay = { date: string; totalMinutes: number; occupiedMinutes: number; status: 'closed' | 'free' | 'partial' | 'full' };
const statuses: Record<string, string> = { SCHEDULED: 'Programada', CONFIRMED: 'Confirmada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió' };

function Roster({ appointments, timezone }: { appointments: DayAppointment[]; timezone: string }) {
  const roster = appointmentRoster(appointments);
  const time = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  if (!roster.total) return <p className="overview-empty">No hay citas para este día.</p>;
  return <div className="overview-doctors">{roster.doctors.map(({ professional, appointments }) =>
    <article className="overview-doctor" key={professional.id}>
      <div className="overview-doctor-heading"><div><h3>{professional.firstName} {professional.lastName}</h3>{professional.specialty && <p>{professional.specialty}</p>}</div><span>{appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}</span></div>
      <ul>{appointments.map(appointment => <li key={appointment.id}>
        <time dateTime={appointment.startsAt}>{time(appointment.startsAt)}–{time(appointment.endsAt)}</time>
        <div><b>{appointment.patient.firstName} {appointment.patient.lastName}</b><span>{appointment.service?.name ?? 'Consulta'}</span></div>
        <small className={'overview-status status-' + appointment.status.toLowerCase()}>{statuses[appointment.status] ?? appointment.status}</small>
      </li>)}</ul>
    </article>
  )}</div>;
}

export function AppointmentOverview({ session, timezone, load, selectedDate, onSelectDate }: Props) {
  const [month, setMonth] = useState(() => { const [year, month] = selectedDate.split('-').map(Number); return new Date(year, Math.floor((month - 1) / 3) * 3, 1); });
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [popover, setPopover] = useState<PersonSubject | { kind: 'day' }>({ kind: 'day' });
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, above: false, pointer: 28 });
  const year = month.getFullYear();
  const scope = [session.user.tenantId, session.user.clinicId ?? '', session.user.id];
  const calendar = useQuery<{ days: CalendarDay[] }>({ queryKey: ['calendar', ...scope, year], queryFn: () => load('/dashboard/calendar?year=' + year) });
  const day = useQuery<DayData>({ queryKey: ['calendar-day', ...scope, selectedDate], queryFn: () => load('/dashboard/day?date=' + selectedDate) });
  const appointments = day.data?.appointments ?? [];
  const roster = appointmentRoster(appointments);
  const localTimezone = day.data?.timezone ?? timezone;
  const selectedLabel = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selectedDate + 'T12:00:00Z'));
  const byDate = new Map((calendar.data?.days ?? []).map(item => [item.date, item]));
  const labels = { closed: 'Sin horario', free: 'Libre', partial: 'Ocupación parcial', full: 'Completo' };
  const close = () => { dialog.current?.close(); setAnchor(null); if (opener.current?.isConnected) opener.current.focus(); };
  const detailAppointments = popover.kind === 'day' ? appointments : appointments.filter(item => popover.kind === 'doctor' ? item.professional.id === popover.id : item.patient.id === popover.id);
  const detailRoster = appointmentRoster(detailAppointments);
  const person = popover.kind === 'doctor' ? detailAppointments[0]?.professional : popover.kind === 'patient' ? detailAppointments[0]?.patient : null;
  const personName = person ? `${person.firstName} ${person.lastName}`.trim() : 'esta persona';
  const detailTitle = popover.kind === 'day' ? selectedLabel : `Citas de ${personName}`;
  const detailSummary = popover.kind === 'day'
    ? `${roster.doctors.length} doctores · ${roster.patients} pacientes · ${roster.total} citas`
    : `${detailRoster.total} ${detailRoster.total === 1 ? 'cita' : 'citas'} · ${popover.kind === 'doctor' ? `${detailRoster.patients} ${detailRoster.patients === 1 ? 'paciente' : 'pacientes'}` : `${detailRoster.doctors.length} ${detailRoster.doctors.length === 1 ? 'profesional' : 'profesionales'}`}`;

  useLayoutEffect(() => {
    if (!anchor || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    const place = () => {
      const rect = element.getBoundingClientRect();
      const left = Math.max(16, Math.min(window.innerWidth - rect.width - 16, anchor.left + anchor.width / 2 - rect.width / 2));
      const below = anchor.bottom + 12;
      const above = below + rect.height > window.innerHeight - 16;
      const top = Math.max(16, Math.min(window.innerHeight - rect.height - 16, above ? anchor.top - rect.height - 12 : below));
      const pointer = Math.max(24, Math.min(rect.width - 24, anchor.left + anchor.width / 2 - left));
      setPosition(previous => previous.left === left && previous.top === top && previous.above === above && previous.pointer === pointer ? previous : { left, top, above, pointer });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); document.body.style.overflow = previousOverflow; };
  }, [anchor, day.data, day.isError, popover]);

  const dayStatus = day.isLoading
    ? <p role="status">Cargando citas…</p>
    : day.isError
      ? <div role="alert"><p>No se pudieron cargar las citas de este día.</p><button type="button" className="secondary" onClick={() => void day.refetch()}>Reintentar</button></div>
      : null;
  const dayContent = dayStatus ?? <AppointmentPersonCards roster={roster} timezone={localTimezone} onDetails={(event, subject) => {
    opener.current = event.currentTarget; setPopover(subject); setAnchor(event.currentTarget.getBoundingClientRect());
  }} />;
  const detailContent = dayStatus ?? <Roster appointments={detailAppointments} timezone={localTimezone} />;

  function monthView(value: number) {
    const first = new Date(year, value, 1);
    const count = new Date(year, value + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    return <section className="calendar-month" key={value}><h3>{first.toLocaleDateString('es-ES', { month: 'long' })}</h3><div className="calendar-grid">
      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, index) => <span className="calendar-weekday" key={'weekday-' + index}>{label}</span>)}
      {Array.from({ length: offset }, (_, index) => <span className="calendar-blank" key={'blank-' + index} />)}
      {Array.from({ length: count }, (_, index) => {
        const date = `${year}-${String(value + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
        const status = byDate.get(date)?.status ?? 'closed';
        return <button type="button" key={date} className={`calendar-day day-${status}${selectedDate === date ? ' selected' : ''}`}
          aria-label={`${date}: ${labels[status]}. Ver citas`} aria-haspopup="dialog" aria-pressed={selectedDate === date}
          onClick={event => { opener.current = event.currentTarget; setPopover({ kind: 'day' }); onSelectDate(date); setAnchor(event.currentTarget.getBoundingClientRect()); }}>{index + 1}</button>;
      })}
    </div></section>;
  }

  return <div className="appointment-overview">
    <section className="calendar-panel"><div className="calendar-heading"><div><p className="eyebrow">Calendario de citas</p><h2>Agenda · {year}</h2><p>Pulsa un día para ver sus doctores y pacientes.</p></div><div className="calendar-controls"><button type="button" className="secondary" aria-label="Trimestre anterior" onClick={() => setMonth(new Date(year, month.getMonth() - 3, 1))}>‹</button><span>{Math.floor(month.getMonth() / 3) + 1} / 4</span><button type="button" className="secondary" aria-label="Trimestre siguiente" onClick={() => setMonth(new Date(year, month.getMonth() + 3, 1))}>›</button></div></div>
      {calendar.isLoading ? <p role="status">Cargando calendario…</p> : calendar.isError ? <p className="error" role="alert">No se pudo cargar el calendario.</p> : <><div className="calendar-months">{[0, 1, 2].map(index => monthView(month.getMonth() + index))}</div><div className="calendar-legend"><span><i className="day-free" />Libre</span><span><i className="day-partial" />Ocupación parcial</span><span><i className="day-full" />Completo</span><span><i className="day-closed" />Sin horario</span></div></>}
    </section>
    <section className="panel overview-roster" aria-label="Doctores y pacientes con citas"><div className="overview-roster-heading"><div><p className="eyebrow">Doctores y pacientes</p><h2>Citas del día</h2></div><span>Horario {localTimezone}</span></div>{dayContent}</section>
    {anchor && createPortal(<dialog ref={dialog} className={`day-popover${position.above ? " above" : ""}`} aria-labelledby="day-popover-title" style={{ left: position.left, top: position.top }} onCancel={close}
      onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <span className="day-popover-pointer" aria-hidden="true" style={{ left: position.pointer }} /><div className="day-popover-scroll"><div className="day-popover-heading"><div><p className="eyebrow">{popover.kind === 'day' ? 'Agenda del día' : popover.kind === 'doctor' ? 'Agenda del profesional' : 'Agenda del paciente'}</p><h2 id="day-popover-title">{detailTitle}</h2>{popover.kind !== 'day' && <p>{selectedLabel}</p>}<p>{day.isLoading ? 'Cargando…' : day.isError ? 'Consulta no disponible' : detailSummary}</p><small>Horario {localTimezone}</small></div><button type="button" className="secondary" aria-label={popover.kind === 'day' ? 'Cerrar citas del día' : 'Cerrar detalles de citas'} autoFocus onClick={close}>×</button></div>{detailContent}</div>
    </dialog>, document.body)}
  </div>;
}

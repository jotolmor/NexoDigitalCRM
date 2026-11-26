import { FormEvent, useEffect, useRef, useState } from 'react';
import { clinicTimeToIso, formatMinute, minuteOf, slotFits, type AgendaAppointment, type DayProfessional } from './agenda-grid';
import { useCustomerText } from './customer-terminology';
import './side-panel.css';

export type PanelTarget =
  | { kind: 'slot'; date: string; startMinute: number; professional: DayProfessional }
  | { kind: 'appointment'; date: string; professional: DayProfessional; appointment: AgendaAppointment };
type Patient = { id: string; firstName: string; lastName: string };
type Write = (path: string, body: unknown, method?: 'PATCH') => Promise<any>;
type Props = { target: PanelTarget; timezone: string; canWrite: boolean; patients: Patient[]; patientsError?: string; write: Write; onDone: () => void; onClose: () => void };

export const statusLabels: Record<string, string> = {
  SCHEDULED: 'Programada', CONFIRMED: 'Confirmada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió', CANCELLED: 'Cancelada',
};

export function longDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AgendaSlotPanel({ target, timezone, canWrite, patients, patientsError, write, onDone, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('select, input, button')?.focus(); }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <aside ref={panel} className="agenda-panel" role="dialog" aria-modal="false" aria-labelledby="agenda-panel-title">
    {target.kind === 'slot'
      ? <SlotForm target={target} timezone={timezone} patients={patients} patientsError={patientsError} write={write} onDone={onDone} />
      : <AppointmentForm target={target} timezone={timezone} canWrite={canWrite} write={write} onDone={onDone} />}
    <button type="button" className="agenda-panel-close" onClick={onClose}>Cerrar</button>
  </aside>;
}

function SlotForm({ target, timezone, patients, patientsError, write, onDone }: { target: Extract<PanelTarget, { kind: 'slot' }>; timezone: string; patients: Patient[]; patientsError?: string; write: Write; onDone: () => void }) {
  const t = useCustomerText();
  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = [...patients].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es'));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = target.professional.services.find(item => item.id === serviceId);
    if (!patientId || !service) { setError(`Elige ${t('paciente')} y tratamiento.`); return; }
    if (!slotFits(target.professional, target.startMinute, service.durationMinutes)) {
      setError(`El tratamiento dura ${service.durationMinutes} min y no cabe en este hueco.`); return;
    }
    setError(''); setBusy(true);
    try {
      await write('/appointments', {
        patientId, professionalId: target.professional.id, serviceId,
        startsAt: clinicTimeToIso(target.date, target.startMinute, timezone),
        endsAt: clinicTimeToIso(target.date, target.startMinute + service.durationMinutes, timezone),
      });
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo reservar la cita.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} aria-busy={busy}>
    <h2 id="agenda-panel-title">Nueva cita</h2>
    <p className="agenda-panel-meta">{target.professional.name} · {longDate(target.date)} · {formatMinute(target.startMinute)}</p>
    <label>{t('Paciente')}<select value={patientId} onChange={event => setPatientId(event.target.value)} required>
      <option value="">{t('Selecciona un paciente')}</option>
      {sorted.map(item => <option key={item.id} value={item.id}>{item.lastName}, {item.firstName}</option>)}
    </select></label>
    <label>Tratamiento<select value={serviceId} onChange={event => setServiceId(event.target.value)} required>
      <option value="">Selecciona un tratamiento</option>
      {target.professional.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}
    </select></label>
    {patientsError && <p className="error" role="alert">{patientsError}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={busy}>{busy ? 'Reservando…' : 'Reservar cita'}</button>
  </form>;
}

function AppointmentForm({ target, timezone, canWrite, write, onDone }: { target: Extract<PanelTarget, { kind: 'appointment' }>; timezone: string; canWrite: boolean; write: Write; onDone: () => void }) {
  const { appointment, professional } = target;
  const [status, setStatus] = useState(appointment.status);
  const [date, setDate] = useState(target.date);
  const [time, setTime] = useState(appointment.start);
  const [serviceId, setServiceId] = useState(appointment.service?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setError(''); setBusy(true);
    try { await action(); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.'); }
    finally { setBusy(false); }
  }
  function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === appointment.status) return;
    void run(() => write(`/appointments/${encodeURIComponent(appointment.id)}/status`, { status }, 'PATCH'));
  }
  function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const service = professional.services.find(item => item.id === serviceId) ?? appointment.service;
    if (!service || !date || !time) { setError('Indica fecha, hora y tratamiento.'); return; }
    const start = minuteOf(time);
    void run(() => write(`/appointments/${encodeURIComponent(appointment.id)}/reschedule`, {
      startsAt: clinicTimeToIso(date, start, timezone), endsAt: clinicTimeToIso(date, start + service.durationMinutes, timezone), serviceId: service.id,
    }, 'PATCH'));
  }
  return <>
    <h2 id="agenda-panel-title">{appointment.patient.firstName} {appointment.patient.lastName}</h2>
    <p className="agenda-panel-meta">{professional.name} · {longDate(target.date)} · {appointment.start}–{appointment.end}{appointment.service ? ` · ${appointment.service.name}` : ''}</p>
    {canWrite && <><form onSubmit={saveStatus} aria-busy={busy}>
      <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="submit" disabled={busy || status === appointment.status}>Guardar estado</button>
    </form>
    <form onSubmit={reschedule} aria-busy={busy}>
      <h3>Cambiar hora</h3>
      <label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label>Hora<input type="time" step={900} value={time} onChange={event => setTime(event.target.value)} required /></label>
      <label>Tratamiento<select value={serviceId} onChange={event => setServiceId(event.target.value)}>
        {professional.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min</option>)}
      </select></label>
      <button className="primary" type="submit" disabled={busy}>Guardar cambio</button>
    </form></>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

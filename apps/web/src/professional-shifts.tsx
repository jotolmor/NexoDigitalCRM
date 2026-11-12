import { useAppointmentsEnabled } from './customer-terminology';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Session } from './access-pages';
import { EditPopover } from './edit-popover';
import { clinicDateKey } from './overview-data';
import { useAssistantConversation } from './assistant-conversation';
import './professional-shifts.css';
import { ShiftReservation } from './shift-reservation';

type Professional = { id: string; firstName: string; lastName: string; specialty: string; active?: boolean };
type Shift = { id: string; professionalId: string; weekday: number; startsAtMinute: number; endsAtMinute: number; validFrom: string; validTo: string };
type RuleInput = Omit<Shift, 'id'>;
type Props = { session: Session; timezone: string; load: (path: string) => Promise<any>; write: (path: string, body: unknown, patch?: boolean) => Promise<any> };
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
function ShiftForm({ professionals, professionalId, initial, timezone, busy, onSave }: { professionals: Professional[]; professionalId: string; initial?: Shift; timezone: string; busy: boolean; onSave: (input: RuleInput) => Promise<void> }) {
  const today = clinicDateKey(new Date(), timezone);
  const [year, month] = today.split('-').map(Number), quarterStart = Math.floor((month - 1) / 3) * 3;
  const from = `${year}-${String(quarterStart + 1).padStart(2, '0')}-01`, to = new Date(Date.UTC(year, quarterStart + 3, 0)).toISOString().slice(0, 10);
  const [draft, setDraft] = useState({ professionalId: initial?.professionalId ?? professionalId, weekday: String(initial?.weekday ?? 1), startsAt: time(initial?.startsAtMinute ?? 540), endsAt: time(initial?.endsAtMinute ?? 780), validFrom: initial?.validFrom.slice(0, 10) ?? from, validTo: initial?.validTo.slice(0, 10) ?? to });
  const [error, setError] = useState('');
  function field(key: keyof typeof draft, value: string) { setDraft(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError('');
    const minute = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
    try { await onSave({ professionalId: draft.professionalId, weekday: Number(draft.weekday), startsAtMinute: minute(draft.startsAt), endsAtMinute: minute(draft.endsAt), validFrom: draft.validFrom, validTo: draft.validTo }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el turno.'); }
  }
  return <form className="directory-create shift-rule-form" aria-label={initial ? 'Editar turno' : 'Añadir turno'} onSubmit={submit}>
    {!initial && <div className="shift-form-heading"><p className="eyebrow">Gestión manual</p><h2>Añadir turno</h2><p>Asigna el día, horario y periodo de vigencia.</p></div>}
    <label>Profesional<select aria-label="Profesional" required value={draft.professionalId} disabled={busy} onChange={event => field('professionalId', event.target.value)}><option value="">Selecciona un profesional</option>{professionals.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select></label>
    <label>Día de la semana<select aria-label="Día de la semana" required value={draft.weekday} disabled={busy} onChange={event => field('weekday', event.target.value)}>{days.slice(1, 6).map((day, i) => <option value={i + 1} key={day}>{day}</option>)}</select></label>
    <label>Inicio<select aria-label="Inicio" required value={draft.startsAt} disabled={busy} onChange={event => { const start = event.target.value; setDraft(current => ({ ...current, startsAt: start, endsAt: time(Math.max(Number(start.slice(0, 2)) + 1, Number(start.slice(0, 2)) < 14 ? 13 : 20) * 60) })); }}>{[9, 10, 11, 12, 13, 16, 17, 18, 19, 20].map(hour => <option key={hour} value={time(hour * 60)}>{time(hour * 60)}</option>)}</select></label>
    <label>Fin<input type="time" aria-label="Fin" step={900} required value={draft.endsAt} disabled={busy} onChange={event => field('endsAt', event.target.value)} /></label>
    <label>Vigente desde<input type="date" required value={draft.validFrom} disabled={busy} onChange={event => field('validFrom', event.target.value)} /></label>
    <label>Vigente hasta<input type="date" min={draft.validFrom} required value={draft.validTo} disabled={busy} onChange={event => field('validTo', event.target.value)} /></label>
    <p className="shift-form-note">Lunes a viernes. Inicio por horas: 09:00–13:00 o 16:00–20:00. Fin cada 15 minutos, hasta las 14:00 o las 21:00. Máximo 5 horas por turno. Horario local: {timezone}.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="shift-form-actions"><button className="primary" disabled={busy || !professionals.length}>{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Guardar turno'}</button></div>
  </form>;
}
export function ProfessionalShifts({ session, timezone, load, write }: Props) {
  const appointmentsEnabled = useAppointmentsEnabled();
  const qc = useQueryClient();
  const professionals = useQuery<Professional[]>({ queryKey: ['schedule-professionals'], queryFn: () => load('/professionals'), select: data => data.filter(person => person.active !== false) });
  const shifts = useQuery<Shift[]>({ queryKey: ['schedule-rules'], queryFn: () => load('/scheduling/rules') });
  const [selectedId, setSelectedId] = useState('');
  const professionalId = selectedId || professionals.data?.[0]?.id || '';
  const selected = professionals.data?.find(person => person.id === professionalId);
  const selectedShifts = (shifts.data ?? []).filter(rule => rule.professionalId === professionalId).sort((a, b) => a.weekday - b.weekday || a.startsAtMinute - b.startsAtMinute || a.validFrom.localeCompare(b.validFrom));
  const [editing, setEditing] = useState<Shift | null>(null), [removing, setRemoving] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const chat = useAssistantConversation(session, 'professional-shifts');
  const chatHistory = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = chatHistory.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.assistantHistory]);
  const pending = chat.assistantAction as { proposalId: string; summaries: string[]; expiresAt: string; requiresAgreement?: boolean } | null;
  const [colleaguesAgree, setColleaguesAgree] = useState(false);
  useEffect(() => { setColleaguesAgree(false); }, [pending?.proposalId]);
  async function refresh() { await Promise.all(['schedule-rules', 'calendar', 'calendar-day', 'appointment-availability'].map(key => qc.invalidateQueries({ queryKey: [key] }))); }
  async function save(input: RuleInput, current?: Shift) {
    setBusy(true); setError(''); setMessage('');
    try { await write(current ? '/scheduling/rules/' + current.id : '/scheduling/rules', input, Boolean(current)); await refresh(); setEditing(null); setSelectedId(input.professionalId); setMessage(current ? 'Turno actualizado.' : 'Turno asignado.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!removing || busy) return; setBusy(true); setError('');
    try { await write('/scheduling/rules/' + removing.id + '/disable', {}, true); await refresh(); setRemoving(null); setMessage(appointmentsEnabled ? 'Turno retirado. Las citas existentes se mantienen.' : 'Turno retirado.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo retirar el turno.'); }
    finally { setBusy(false); }
  }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const question = chat.assistantDraft.trim(); if (!question || chat.assistantBusy || busy) return;
    chat.setAssistantBusy(true); chat.setAssistantError(''); chat.setAssistantAction(null);
    const history = chat.assistantHistory;
    chat.setAssistantHistory([...history, { role: 'user', content: question }]); chat.setAssistantDraft('');
    try {
      const result = await write('/scheduling/assistant/ask', { question, history, selectedProfessionalId: professionalId || undefined });
      chat.setAssistantHistory(previous => [...previous, { role: 'assistant', content: result.answer }]); chat.setAssistantAction(result.pendingAction ?? null);
    } catch (failure) { chat.setAssistantError(failure instanceof Error ? failure.message : 'No se pudo consultar el asistente de turnos.'); }
    finally { chat.setAssistantBusy(false); }
  }
  async function confirm() {
    if (!pending || chat.assistantBusy || busy || (pending.requiresAgreement && !colleaguesAgree)) return; chat.setAssistantBusy(true); chat.setAssistantError('');
    try { const result = await write('/scheduling/assistant/confirm', { proposalId: pending.proposalId, ...(pending.requiresAgreement ? { colleaguesAgree } : {}) }); chat.setAssistantHistory(previous => [...previous, { role: 'assistant', content: result.message }]); }
    catch (failure) { chat.setAssistantError(failure instanceof Error ? failure.message : 'No se pudo confirmar el cambio. Consulta los turnos y prepara una nueva propuesta.'); }
    finally { chat.setAssistantAction(null); await refresh(); chat.setAssistantBusy(false); }
  }
  return <>
    <header><div><p className="eyebrow">Organización del equipo</p><h1>Turnos de profesionales</h1><p>Asigna y modifica los turnos de tu equipo, a mano o con la ayuda de Nexo IA.</p></div></header>
    <div className="professional-shifts-page">
      <section className="panel shifts-assistant-panel" aria-label="Asistente IA de turnos">
        <div className="shift-ai-heading"><span className="patient-directory-avatar" aria-hidden="true">✦</span><div><p className="eyebrow">Nexo IA</p><h2>Asistente de turnos</h2><p>Consulta los turnos asignados o pide cambios. Revisa la propuesta y confirma para guardarla.</p></div><button className="secondary" disabled={chat.assistantBusy} onClick={chat.resetAssistantConversation}>Nueva conversación</button></div>
        {chat.assistantHistory.length > 0 && <div ref={chatHistory} className="assistant-chat-history" role="log" aria-label="Conversación del asistente de turnos" tabIndex={0} aria-live="polite">{chat.assistantHistory.map((entry, index) => <div className={'assistant-chat-message ' + entry.role} key={index}><b>{entry.role === 'user' ? 'Tú' : 'Nexo IA'}</b><span>{entry.content}</span></div>)}</div>}
        {chat.assistantError && <p className="error" role="alert">{chat.assistantError}</p>}
        {pending && <div className="assistant-confirm-card shift-proposal"><h3>Propuesta de turnos</h3><ul>{pending.summaries.map((summary, index) => <li key={index}>{summary}</li>)}</ul><p>{appointmentsEnabled && 'Las citas ya reservadas se mantienen. '}Esta propuesta caduca en 10 minutos.</p><div>{pending.requiresAgreement && <label className="shift-colleague-agreement"><input type="checkbox" checked={colleaguesAgree} disabled={chat.assistantBusy || busy} onChange={event => setColleaguesAgree(event.target.checked)} />Confirmo que los profesionales implicados están de acuerdo con estos cambios.</label>}<button className="primary" disabled={chat.assistantBusy || busy || (pending.requiresAgreement && !colleaguesAgree)} onClick={() => void confirm()}>Confirmar cambios</button><button className="secondary" disabled={chat.assistantBusy} onClick={() => chat.setAssistantAction(null)}>Descartar propuesta</button></div></div>}
        <form className="assistant-ask shift-assistant-form" onSubmit={ask}><label className="workspace-visually-hidden" htmlFor="shift-ai-question">Mensaje para el asistente de turnos</label><textarea id="shift-ai-question" required minLength={2} maxLength={1000} rows={2} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            if (!event.repeat && !chat.assistantBusy && !busy) event.currentTarget.form?.requestSubmit();
          }
        }} value={chat.assistantDraft} disabled={chat.assistantBusy || busy} onChange={event => chat.setAssistantDraft(event.target.value)} placeholder="Ejemplo: consulta los turnos de Clara Montoro del próximo trimestre." /><button className="primary" disabled={chat.assistantBusy || busy}>{chat.assistantBusy ? 'Consultando…' : 'Consultar IA'}</button></form>
      </section>
      <section className="panel professional-shift-picker"><div className="directory-list-heading"><div><p className="eyebrow">Tu equipo</p><h2>Profesionales y turnos asignados</h2></div><span className="schedule-total">{professionals.data?.length ?? 0}</span></div>
        {professionals.isLoading ? <p>Cargando profesionales…</p> : professionals.isError ? <div role="alert"><p>No se pudieron cargar los profesionales.</p><button className="secondary" onClick={() => void professionals.refetch()}>Reintentar profesionales</button></div> : professionals.data?.length ? <ul className="shift-professional-grid">{professionals.data.map(person => <li key={person.id} className={'shift-professional-card' + (professionalId === person.id ? ' selected' : '')}><span className="patient-directory-avatar" aria-hidden="true">{person.firstName.charAt(0)}{person.lastName.charAt(0)}</span><h3>{person.firstName} {person.lastName}</h3><p>{person.specialty}</p><span>{shifts.isError ? 'Turnos no disponibles' : shifts.isLoading ? 'Cargando turnos…' : `${shifts.data?.filter(rule => rule.professionalId === person.id).length ?? 0} ${shifts.data?.filter(rule => rule.professionalId === person.id).length === 1 ? 'turno' : 'turnos'}`}</span><button type="button" className="secondary" aria-pressed={professionalId === person.id} onClick={() => setSelectedId(person.id)}>Ver turnos de {person.firstName}</button></li>)}</ul> : <p className="empty">Añade profesionales desde su sección para asignarles turnos.</p>}
      </section>
      <section className="management shifts-manual-panel"><ShiftForm key={professionalId} professionalId={professionalId} professionals={professionals.data ?? []} timezone={timezone} busy={busy || chat.assistantBusy} onSave={input => save(input)} /></section>
      <section className="panel shifts-roster-panel"><div className="directory-list-heading"><div><p className="eyebrow">Planificación</p><h2>{selected ? `Turnos de ${selected.firstName} ${selected.lastName}` : 'Turnos asignados'}</h2><p>Periodos de asignación registrados · {timezone}</p></div><span className="schedule-total">{selectedShifts.length}</span></div>
        {message && <p className="success" role="status">{message}</p>}
        {shifts.isLoading ? <p>Cargando turnos…</p> : shifts.isError ? <div role="alert"><p>No se pudieron cargar los turnos.</p><button className="secondary" onClick={() => void shifts.refetch()}>Reintentar turnos</button></div> : selectedShifts.length ? <ul className="professional-shift-grid">{selectedShifts.map(rule => <li key={rule.id} className="professional-shift-card"><span className="patient-directory-avatar" aria-hidden="true">◷</span><p className="eyebrow">{rule.startsAtMinute < 840 ? 'Mañana' : 'Tarde'}</p><h3>{days[rule.weekday]}</h3><b className="professional-shift-time">{time(rule.startsAtMinute)}–{time(rule.endsAtMinute)}</b><p>Desde {rule.validFrom.slice(0, 10)}<br />Hasta {rule.validTo.slice(0, 10)}</p><div><button className="secondary" disabled={busy || chat.assistantBusy} onClick={() => { setEditing(rule); setError(''); }}>Editar turno</button><button className="secondary" disabled={busy || chat.assistantBusy} onClick={() => { setRemoving(rule); setError(''); }}>Retirar turno</button>{appointmentsEnabled && <ShiftReservation load={load} write={write} professionalId={rule.professionalId} weekday={rule.weekday} startsAtMinute={rule.startsAtMinute} validFrom={rule.validFrom.slice(0,10)} validTo={rule.validTo.slice(0,10)} />}</div></li>)}</ul> : <p className="empty">Este profesional no tiene turnos asignados. Añade uno manualmente o pídeselo al asistente.</p>}
      </section>
    </div>
    {editing && <EditPopover title="Editar turno" busy={busy} onClose={() => setEditing(null)}><ShiftForm initial={editing} professionalId={professionalId} professionals={professionals.data ?? []} timezone={timezone} busy={busy} onSave={input => save(input, editing)} /></EditPopover>}
    {removing && <EditPopover title="Retirar turno" busy={busy} onClose={() => setRemoving(null)}><div className="shift-removal"><p>{selected?.firstName} {selected?.lastName} · {days[removing.weekday]} · {time(removing.startsAtMinute)}–{time(removing.endsAtMinute)}</p><p>Se retirará este turno del periodo {removing.validFrom.slice(0, 10)} a {removing.validTo.slice(0, 10)}.{appointmentsEnabled && ' Las citas existentes se mantienen.'}</p>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={() => void remove()}>Confirmar retirada</button><button className="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button></div></EditPopover>}
  </>;
}

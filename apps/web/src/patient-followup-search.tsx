import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditPopover } from './edit-popover';
import { PatientCardSummary } from './patient-card-summary';
import './patient-followup-search.css';

type Patient = Parameters<typeof PatientCardSummary>[0]['patient'] & { id: string };
type FollowUp = { id: string; patientId: string; title: string; notes?: string | null; dueAt?: string | null; status: string };
type Filters = { name: string; dni: string; phone: string };
type Props = { scope: string[]; load: (path: string) => Promise<any>; update: (path: string, body: unknown) => Promise<any> };
export function PatientFollowUpSearch({ scope, load, update }: Props) {
  const qc = useQueryClient();
  const [criteria, setCriteria] = useState<{ filters: Filters; revision: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fromSearch, setFromSearch] = useState(false);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [draft, setDraft] = useState({ title: '', dueAt: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const patients = useQuery<Patient[]>({ queryKey: ['patients-follow-ups', ...scope], queryFn: () => load('/patients') });
  const followUps = useQuery<FollowUp[]>({ queryKey: ['follow-ups', ...scope], queryFn: () => load('/follow-ups') });
  const results = useQuery<Patient[]>({
    queryKey: ['patient-search', ...scope, criteria], enabled: criteria !== null, retry: false,
    queryFn: () => load('/patients?' + new URLSearchParams(Object.entries(criteria!.filters).filter(([, value]) => value)))
  });
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const filters = { name: String(values.get('name') ?? '').trim(), dni: String(values.get('dni') ?? '').trim(), phone: String(values.get('phone') ?? '').trim() };
    if (!Object.values(filters).some(Boolean)) { setFormError('Introduce al menos un nombre, DNI o teléfono.'); return; }
    if (filters.phone && !/\d/.test(filters.phone)) { setFormError('Introduce un teléfono con dígitos.'); return; }
    setFormError(''); setDetailError(''); setSelected(null); setEditing(null); setFromSearch(true); setDialogOpen(true);
    setCriteria(previous => ({ filters, revision: (previous?.revision ?? 0) + 1 }));
  }
  function showPatient(patient: Patient, searchResult = false) {
    setSelected(patient); setFromSearch(searchResult); setEditing(null); setDetailError(''); setDialogOpen(true);
  }
  function close() { setDialogOpen(false); setSelected(null); setEditing(null); setDetailError(''); }
  function edit(task: FollowUp) {
    const date = task.dueAt ? new Date(task.dueAt) : null;
    setDraft({ title: task.title, notes: task.notes ?? '', dueAt: date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' });
    setEditing(task); setDetailError('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editing || !selected) return;
    setBusy(true); setDetailError('');
    try {
      await update('/follow-ups/' + editing.id, { patientId: selected.id, title: draft.title.trim(), notes: draft.notes.trim() || null, dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null });
      await qc.invalidateQueries({ queryKey: ['follow-ups'] }); setEditing(null);
    } catch (error) { setDetailError(error instanceof Error ? error.message : 'No se pudo guardar el seguimiento.'); }
    finally { setBusy(false); }
  }
  async function complete(task: FollowUp) {
    if (busy) return;
    setBusy(true); setDetailError('');
    try { await update('/follow-ups/' + task.id + '/status', { status: 'COMPLETED' }); await qc.invalidateQueries({ queryKey: ['follow-ups'] }); }
    catch (error) { setDetailError(error instanceof Error ? error.message : 'No se pudo completar el seguimiento.'); }
    finally { setBusy(false); }
  }
  function cards(records: Patient[], searchResult = false) {
    return <div className="directory-patients followup-patient-cards"><ul className="directory-list">{records.map(patient => {
      const count = followUps.data?.filter(task => task.patientId === patient.id).length;
      return <li className="directory-record" key={patient.id}><PatientCardSummary patient={patient} />
        <span className="followup-patient-count">{followUps.isError ? 'Seguimiento no disponible' : count == null ? 'Cargando seguimiento…' : `${count} ${count === 1 ? 'seguimiento' : 'seguimientos'}`}</span>
        <button type="button" className="secondary directory-edit-button" onClick={() => showPatient(patient, searchResult)}>Ver seguimiento</button>
      </li>;
    })}</ul></div>;
  }
  const patientTasks = followUps.data?.filter(task => task.patientId === selected?.id) ?? [];
  return <>
    <header><div><p className="eyebrow">Atención al paciente</p><h1>Seguimiento</h1><p>Encuentra un paciente por su nombre, DNI o teléfono y consulta sus seguimientos.</p></div></header>
    <section className="management followup-search-layout">
      <form className="directory-create followup-search-form" aria-label="Buscar pacientes" onSubmit={search}>
        <h2>Buscar pacientes</h2>
        <label>Nombre del paciente<input name="name" autoComplete="off" maxLength={120} placeholder="Nombre y apellidos" /></label>
        <label>DNI<input name="dni" autoComplete="off" maxLength={20} placeholder="DNI o NIE" /></label>
        <label>Teléfono<input type="tel" name="phone" autoComplete="off" maxLength={40} placeholder="Número de teléfono" /></label>
        <button type="submit" className="primary">Buscar paciente</button>
        {formError && <p className="error" role="alert">{formError}</p>}
      </form>
      <section className="panel directory-list-panel"><div className="directory-list-heading"><div><p className="eyebrow">Pacientes</p><h2>Pacientes de la clínica</h2></div><span className="schedule-total">{patients.data?.length ?? 0}</span></div>
        {patients.isLoading ? <p>Cargando pacientes…</p> : patients.isError ? <div role="alert"><p>No se pudieron cargar los pacientes.</p><button type="button" className="secondary" onClick={() => void patients.refetch()}>Reintentar</button></div> : patients.data?.length ? cards(patients.data) : <p className="empty">Todavía no hay pacientes registrados.</p>}
      </section>
    </section>
    {dialogOpen && <EditPopover title={editing ? 'Editar seguimiento: ' + editing.title : selected ? selected.firstName + ' ' + selected.lastName : 'Resultados de búsqueda'} caption="Seguimiento de pacientes" closeLabel="Cerrar seguimiento" busy={busy} onClose={close}>
      {editing ? <form className="directory-edit-form" aria-label="Editar seguimiento" onSubmit={save}>
        <label>Asunto<input required minLength={2} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} disabled={busy} /></label>
        <label>Fecha límite<input type="datetime-local" value={draft.dueAt} onChange={event => setDraft({ ...draft, dueAt: event.target.value })} disabled={busy} /></label>
        <label>Notas<textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} disabled={busy} /></label>
        {detailError && <p className="error" role="alert">{detailError}</p>}
        <div className="directory-edit-actions"><button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setDetailError(''); }}>Cancelar</button></div>
      </form> : selected ? <div className="followup-patient-detail">
        <div className="followup-patient-identity"><PatientCardSummary patient={selected} /></div>
        {detailError && <p className="error" role="alert">{detailError}</p>}
        <h3>Seguimientos del paciente</h3>
        {followUps.isLoading ? <p>Cargando seguimientos…</p> : followUps.isError ? <div role="alert"><p>No se pudieron cargar los seguimientos.</p><button type="button" className="secondary" onClick={() => void followUps.refetch()}>Reintentar</button></div> : patientTasks.length ? <ul className="followup-task-list">{patientTasks.map(task => <li key={task.id}>
          <b>{task.title}</b><span className={'status status-' + (task.status === 'PENDING' ? 'pending' : 'completed')}>{task.status === 'PENDING' ? 'Pendiente' : 'Completado'}</span>
          {task.dueAt && <span>{new Date(task.dueAt).toLocaleString('es-ES')}</span>}{task.notes && <p>{task.notes}</p>}
          <div><button type="button" className="secondary" disabled={busy} onClick={() => edit(task)}>Editar</button>{task.status === 'PENDING' && <button type="button" className="secondary" disabled={busy} onClick={() => void complete(task)}>Completar</button>}</div>
        </li>)}</ul> : <p className="empty">Este paciente no tiene seguimientos registrados.</p>}
        {fromSearch && <button type="button" className="secondary" disabled={busy} onClick={() => setSelected(null)}>Volver a resultados</button>}
      </div> : <div aria-live="polite">
        {results.isFetching ? <p>Buscando pacientes…</p> : results.isError ? <div role="alert"><p>No se pudo realizar la búsqueda.</p><button type="button" className="secondary" onClick={() => void results.refetch()}>Reintentar búsqueda</button></div> : results.data?.length ? <><p>{results.data.length} {results.data.length === 1 ? 'paciente encontrado' : 'pacientes encontrados'}</p>{cards(results.data, true)}</> : <p className="empty">No se encontraron pacientes con esos datos. Revisa los criterios de búsqueda.</p>}
      </div>}
    </EditPopover>}
  </>;
}

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './patient-create-form.css';

export const patientFields = [
  ['firstName', 'Nombre'], ['lastName', 'Apellidos'], ['email', 'Correo'],
  ['phone', 'Teléfono'], ['address', 'Dirección'], ['city', 'Municipio']
] as const;

type CreatedPatient = { id: string; firstName: string; lastName: string };
type Props = {
  createPatient: (body: Record<string, string>) => Promise<CreatedPatient>;
  onCreated?: (patient: CreatedPatient) => void;
  horizontal?: boolean;
};

export function PatientCreateForm({ createPatient, onCreated, horizontal = false }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = Object.fromEntries(patientFields.map(([key]) => [key, String(values.get(key) ?? '').trim()]).filter(([, value]) => value));
    setMessage(''); setError('');
    if (!body.firstName || !body.lastName) { setError('Indica el nombre y los apellidos del paciente.'); return; }
    setBusy(true);
    try {
      const patient = await createPatient(body);
      await Promise.all(['Pacientes', 'patients-agenda', 'patients-follow-ups', 'shift-booking-patients'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      onCreated?.(patient);
      if (form.isConnected) form.reset();
      setMessage('Paciente guardado correctamente.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el paciente.'); }
    finally { setBusy(false); }
  }

  return <form className={'patient-create-form ' + (horizontal ? 'patient-create-horizontal' : 'directory-create')} onSubmit={submit} aria-label="Nuevo paciente" aria-busy={busy}>
    <div className="patient-create-heading"><div>{horizontal && <p className="eyebrow">Pacientes</p>}<h2>{horizontal ? 'Nuevo paciente' : 'Añadir paciente'}</h2></div>{horizontal && <p>Registra sus datos y continúa con la reserva de su cita.</p>}</div>
    <div className="patient-create-fields">{patientFields.map(([key, label]) => <label key={key}>{label}<input name={key} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} required={key === 'firstName' || key === 'lastName'} disabled={busy} /></label>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    <div className="patient-create-footer"><button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : horizontal ? 'Guardar paciente' : 'Guardar'}</button></div>
  </form>;
}

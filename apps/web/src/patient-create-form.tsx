import { useAppointmentsEnabled, useCustomerText } from './customer-terminology';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clinicDateKey } from './overview-data';
import { patientAgeOnDate } from './patient-demographics';
import './patient-create-form.css';

export const patientFields = [
  ['firstName', 'Nombre'], ['lastName', 'Apellidos'], ['dni', 'DNI'], ['dateOfBirth', 'Fecha de nacimiento'], ['age', 'Edad (años)'],
  ['email', 'Correo'], ['phone', 'Teléfono'], ['address', 'Dirección'],
  ['postalCode', 'Código postal'], ['city', 'Localidad'], ['province', 'Provincia']
] as const;

type CreatedPatient = { id: string; firstName: string; lastName: string };
type Props = {
  createPatient: (body: Record<string, string | number>) => Promise<CreatedPatient>;
  onCreated?: (patient: CreatedPatient) => void;
  horizontal?: boolean;
  timezone?: string;
};

export function PatientCreateForm({ createPatient, onCreated, horizontal = false, timezone = 'Europe/Madrid' }: Props) {
  const t = useCustomerText();
  const appointmentsEnabled = useAppointmentsEnabled();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [manualAge, setManualAge] = useState('');
  const today = clinicDateKey(new Date(), timezone);
  const ageValue = birthDate ? patientAgeOnDate(birthDate, today) ?? '' : manualAge;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const body: Record<string, string | number> = Object.fromEntries(patientFields.map(([key]) => [key, String(values.get(key) ?? '').trim()]).filter(([, value]) => value));
    setMessage(''); setError('');
    if (!body.firstName || !body.lastName) { setError(t("Indica el nombre y los apellidos del paciente.")); return; }
    if (body.dateOfBirth) {
      if (patientAgeOnDate(String(body.dateOfBirth), today) === null) { setError('Revisa la fecha de nacimiento.'); return; }
      delete body.age;
    } else if (body.age !== undefined) {
      const age = Number(body.age);
      if (!Number.isInteger(age) || age < 0 || age > 130) { setError('Indica una edad entre 0 y 130 años.'); return; }
      body.age = age;
    }
    setBusy(true);
    try {
      const patient = await createPatient(body);
      await Promise.all(['Pacientes', 'patients-agenda', 'patients-follow-ups', 'shift-booking-patients'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      onCreated?.(patient);
      if (form.isConnected) { form.reset(); setBirthDate(''); setManualAge(''); }
      setMessage(t("Paciente guardado correctamente."));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("No se pudo guardar el paciente.")); }
    finally { setBusy(false); }
  }

  return <form className={'patient-create-form ' + (horizontal ? 'patient-create-horizontal' : 'directory-create')} onSubmit={submit} aria-label={t("Nuevo paciente")} aria-busy={busy}>
    <div className="patient-create-heading"><div>{horizontal && <p className="eyebrow">{t("Pacientes")}</p>}<h2>{horizontal ? t("Nuevo paciente") : t("Añadir paciente")}</h2></div>{horizontal && <p>{appointmentsEnabled ? 'Registra sus datos y continúa con la reserva de su cita.' : 'Registra sus datos para gestionar los servicios de tu negocio.'}</p>}</div>
    <div className="patient-create-fields">{patientFields.map(([key, label]) => <label key={key} className={'patient-field-' + key}>{label}<input name={key} type={key === 'dateOfBirth' ? 'date' : key === 'age' ? 'number' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={key === 'dateOfBirth' ? birthDate : key === 'age' ? ageValue : undefined} onChange={key === 'dateOfBirth' ? event => setBirthDate(event.target.value) : key === 'age' ? event => setManualAge(event.target.value) : undefined} readOnly={key === 'age' && Boolean(birthDate)} min={key === 'age' ? 0 : undefined} max={key === 'dateOfBirth' ? today : key === 'age' ? 130 : undefined} step={key === 'age' ? 1 : undefined} minLength={key === 'dni' ? 3 : undefined} maxLength={key === 'dni' ? 20 : key === 'postalCode' ? 20 : key === 'province' ? 120 : undefined} required={key === 'firstName' || key === 'lastName'} disabled={busy} /></label>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    <div className="patient-create-footer"><button type="submit" className="primary" disabled={busy}>{busy ? 'Guardando…' : horizontal ? t("Guardar paciente") : 'Guardar'}</button></div>
  </form>;
}

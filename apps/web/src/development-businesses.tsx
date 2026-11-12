import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from './access-pages';
import { EditPopover } from './edit-popover';
import { registrationSectors, sectorSpecialties, type RegistrationSector } from './registration-sectors';
import './development-businesses.css';

type Business = { id: string; name: string; businessType: RegistrationSector; specialty: string };
export function DevelopmentBusinesses({ session, load, write, onSession }: {
  session: Session; load: (path: string) => Promise<any>;
  write: (path: string, body: unknown) => Promise<Session>; onSession: (session: Session) => void;
}) {
  const businesses = useQuery<Business[]>({ queryKey: ['development-businesses', session.user.id], queryFn: () => load('/development/businesses') });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sector, setSector] = useState<RegistrationSector>('CLINIC');
  const [specialty, setSpecialty] = useState<string>(sectorSpecialties.CLINIC[0]);
  const [other, setOther] = useState(false);
  async function select(id: string) {
    if (!id || id === session.user.clinicId || busy) return;
    setBusy(true); setError('');
    try { onSession(await write('/development/businesses/' + encodeURIComponent(id) + '/select', {})); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cambiar de negocio.'); setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { onSession(await write('/development/businesses', { name: String(form.get('name') ?? '').trim(), address: String(form.get('address') ?? '').trim(), businessType: sector, specialty: specialty.trim() })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo crear el negocio.'); setBusy(false); }
  }
  return <section className="panel development-businesses" aria-label="Negocios de desarrollo">
    <div><p className="eyebrow">Desarrollo del CRM</p><strong>Un usuario · Todos tus negocios de prueba</strong></div>
    <label>Negocio activo<select aria-label="Negocio activo" value={session.user.clinicId ?? ''} disabled={busy || businesses.isLoading || businesses.isError} onChange={event => void select(event.target.value)}>
      {!businesses.data?.some(business => business.id === session.user.clinicId) && <option value={session.user.clinicId ?? ''}>Negocio actual</option>}
      {businesses.data?.map(business => <option key={business.id} value={business.id}>{business.name} · {registrationSectors.find(sector => sector.value === business.businessType)?.label ?? business.businessType}</option>)}
    </select></label>
    <button type="button" className="secondary" disabled={busy} onClick={() => { setError(''); setOpen(true); }}>Crear negocio de prueba</button>
    {businesses.isError && <p className="error" role="alert">No se pudo cargar el listado. <button type="button" className="link" onClick={() => void businesses.refetch()}>Reintentar</button></p>}
    {error && !open && <p className="error" role="alert">{error}</p>}
    {open && <EditPopover title="Crear negocio de prueba" caption="Cuenta única de desarrollo" closeLabel="Cerrar nuevo negocio" busy={busy} onClose={() => setOpen(false)}>
      <form className="development-business-form" onSubmit={create}>
        <label>Nombre del negocio<input name="name" required minLength={2} maxLength={120} disabled={busy} /></label>
        <label>Dirección del negocio<input name="address" maxLength={300} disabled={busy} /></label>
        <label>Sector<select value={sector} disabled={busy} onChange={event => { const value = event.target.value as RegistrationSector; setSector(value); setSpecialty(sectorSpecialties[value][0]); setOther(false); }}>{registrationSectors.map(sector => <option key={sector.value} value={sector.value}>{sector.label}</option>)}</select></label>
        <label>Especialidad o actividad<select value={other ? '__other__' : specialty} disabled={busy} onChange={event => { setOther(event.target.value === '__other__'); setSpecialty(event.target.value === '__other__' ? '' : event.target.value); }}>{sectorSpecialties[sector].map(name => <option key={name} value={name}>{name}</option>)}<option value="__other__">Otra actividad</option></select></label>
        {other && <label>Indica la actividad<input value={specialty} onChange={event => setSpecialty(event.target.value)} required maxLength={150} disabled={busy} /></label>}
        {error && <p className="error" role="alert">{error}</p>}
        <div><button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button className="primary" disabled={busy || !specialty.trim()}>{busy ? 'Creando…' : 'Crear y abrir negocio'}</button></div>
      </form>
    </EditPopover>}
  </section>;
}

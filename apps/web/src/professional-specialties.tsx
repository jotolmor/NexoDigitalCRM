import { useState } from 'react';
import { sectorSpecialties, type RegistrationSector } from './registration-sectors';

const dental = ['Odontología general', 'Ortodoncia', 'Endodoncia', 'Periodoncia', 'Odontopediatría', 'Implantología dental', 'Cirugía oral y maxilofacial', 'Prótesis dental', 'Odontología estética'];
const support = ['Enfermería', 'Fisioterapia', 'Rehabilitación', 'Osteopatía', 'Podología', 'Psicología', 'Psiquiatría', 'Nutrición y dietética', 'Logopedia', 'Terapia ocupacional', 'Optometría', 'Audiología', 'Veterinaria', 'Higiene bucodental', 'Centro multidisciplinar'];
const clinical = {
  'Odontología': dental,
  'Medicina': sectorSpecialties.CLINIC.filter(item => !support.includes(item) && !dental.includes(item) && item !== 'Odontología'),
  'Enfermería': ['Enfermería general', 'Enfermería pediátrica', 'Enfermería geriátrica', 'Enfermería del trabajo', 'Enfermería de salud mental', 'Enfermería familiar y comunitaria', 'Enfermería obstétrico-ginecológica'],
  'Fisioterapia': ['Fisioterapia general', 'Fisioterapia deportiva', 'Fisioterapia neurológica', 'Fisioterapia pediátrica', 'Fisioterapia respiratoria', 'Fisioterapia de suelo pélvico', 'Rehabilitación', 'Osteopatía'],
  'Psicología': ['Psicología general sanitaria', 'Psicología clínica', 'Psicología infantil y adolescente', 'Neuropsicología', 'Psicología de pareja y familia', 'Psicología deportiva'],
  'Nutrición': ['Nutrición y dietética', 'Nutrición clínica', 'Nutrición deportiva', 'Nutrición infantil'],
  'Higiene bucodental': ['Higiene bucodental'],
  'Otros profesionales sanitarios': support.filter(item => !['Enfermería', 'Fisioterapia', 'Psicología', 'Nutrición y dietética', 'Higiene bucodental'].includes(item))
};
function groupsFor(sector: string): Record<string, readonly string[]> {
  if (sector === 'CLINIC' || !(sector in sectorSpecialties)) return clinical;
  // Each activity can also be a profession outside the clinical sector.
  return Object.fromEntries(sectorSpecialties[sector as RegistrationSector].map(item => [item, [item]]));
}
export function ProfessionalSpecialtyFields({ sector = 'CLINIC', value, onChange }: { sector?: string; value?: string; onChange?: (value: string) => void }) {
  const groups = groupsFor(sector);
  const initialGroup = value ? Object.keys(groups).find(key => groups[key].includes(value)) ?? 'Otra profesión' : '';
  const [profession, setProfession] = useState(initialGroup);
  const [specialty, setSpecialty] = useState(value ?? '');
  const [custom, setCustom] = useState(Boolean(value && !Object.values(groups).some(items => items.includes(value))));
  const options = groups[profession] ?? [];
  function change(next: string) { setSpecialty(next); onChange?.(next); }
  return <>
    <label>Profesión<select aria-label="Profesión" required value={profession} onChange={event => { setProfession(event.target.value); setCustom(event.target.value === 'Otra profesión'); change(''); }}>
      <option value="">Selecciona una profesión</option>{Object.keys(groups).map(name => <option key={name}>{name}</option>)}<option>Otra profesión</option>
    </select></label>
    <label>Especialidad<select aria-label="Especialidad" required disabled={!profession} name={onChange || custom ? undefined : 'specialty'} value={custom ? '__custom__' : specialty}
      onChange={event => { const isCustom = event.target.value === '__custom__'; setCustom(isCustom); change(isCustom ? '' : event.target.value); }}>
      <option value="">Selecciona una especialidad</option>{options.map(name => <option key={name}>{name}</option>)}<option value="__custom__">Otra especialidad</option>
    </select></label>
    {custom && <label>Especifica la especialidad<input required minLength={2} name={onChange ? undefined : 'specialty'} value={specialty} onChange={event => change(event.target.value)} /></label>}
  </>;
}

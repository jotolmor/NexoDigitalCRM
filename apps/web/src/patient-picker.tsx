import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { moveHighlight, pickerMatches } from './patient-picker-data';
import type { TablePatient } from './patient-table-data';
import { useCustomerText } from './customer-terminology';
import './patient-picker.css';

type Props = {
  patients: TablePatient[]; value: string; onChange: (id: string) => void;
  /** Form field name for forms that read FormData. */
  name?: string;
  /** Shown when nothing matches, where creating a patient is possible. */
  onCreate?: () => void;
};

/** Type-to-search patient field (ARIA combobox) that replaces long patient dropdowns. */
export function PatientPicker({ patients, value, onChange, name, onCreate }: Props) {
  const t = useCustomerText();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [refocus, setRefocus] = useState(false);
  const selected = value ? patients.find(item => item.id === value) : undefined;
  const matches = pickerMatches(patients, query);
  useEffect(() => { if (refocus && !selected) { input.current?.focus(); setRefocus(false); } }, [refocus, selected]);

  function choose(patient: TablePatient) { onChange(patient.id); setQuery(''); setOpen(false); setHighlight(-1); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setHighlight(current => moveHighlight(current, matches.length, event.key === 'ArrowDown' ? 1 : -1)); }
    else if (event.key === 'Enter' && open && matches[highlight]) { event.preventDefault(); choose(matches[highlight]); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  }

  return <div className="patient-picker">
    <label htmlFor={id}>{t('Paciente')}</label>
    {name && <input type="hidden" name={name} value={value} />}
    {selected ? <div className="patient-picker-chosen">
      <span className="patient-picker-avatar" aria-hidden="true">{selected.firstName.charAt(0)}{selected.lastName.charAt(0)}</span>
      <span id={id}>{selected.firstName} {selected.lastName}</span>
      <button type="button" aria-label={`Cambiar ${t('paciente')}`} onClick={() => { onChange(''); setRefocus(true); }}>✕</button>
    </div> : <>
      <input ref={input} id={id} type="text" role="combobox" autoComplete="off" value={query} placeholder="Escribe nombre, DNI o teléfono"
        aria-expanded={open && query.trim() !== ''} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && matches[highlight] ? `${id}-${matches[highlight].id}` : undefined}
        onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keyDown} />
      {open && query.trim() !== '' && <ul id={`${id}-list`} role="listbox" className="patient-picker-list">
        {matches.map((patient, index) => <li key={patient.id} id={`${id}-${patient.id}`} role="option" aria-selected={index === highlight}
          onMouseDown={event => { event.preventDefault(); choose(patient); }} onMouseEnter={() => setHighlight(index)}>
          <span className="patient-picker-avatar" aria-hidden="true">{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</span>
          <span>{patient.firstName} {patient.lastName}</span>
          <small>{[patient.phone, patient.dni].filter(Boolean).join(' · ')}</small>
        </li>)}
        {matches.length === 0 && <li className="patient-picker-empty" role="presentation">
          No hay coincidencias.{onCreate && <> <button type="button" onMouseDown={event => event.preventDefault()} onClick={onCreate}>Crear {t('paciente')} nuevo</button></>}
        </li>}
      </ul>}
    </>}
  </div>;
}

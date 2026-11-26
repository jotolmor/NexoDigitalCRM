import { useState } from 'react';
import { filterPatients, paginate, sortPatients, type SortDirection, type SortKey, type TablePatient } from './patient-table-data';
import { useCustomerText } from './customer-terminology';
import './patient-table.css';

type Props<T extends TablePatient> = { patients: T[]; onOpen: (patient: T) => void };

export function PatientTable<T extends TablePatient>({ patients, onOpen }: Props<T>) {
  const t = useCustomerText();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const found = sortPatients(filterPatients(patients, query), sort.key, sort.direction);
  const view = paginate(found, page);
  const toggle = (key: SortKey) => { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); setPage(1); };
  const ariaSort = (key: SortKey) => sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = (key: SortKey) => sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';

  return <div className="patient-table">
    <div className="patient-table-tools">
      <label className="patient-table-search"><span className="workspace-visually-hidden">{t('Buscar pacientes')}</span>
        <input type="search" value={query} placeholder="Buscar por nombre, DNI, teléfono o correo" onChange={event => { setQuery(event.target.value); setPage(1); }} />
      </label>
      <span className="patient-table-count" role="status">{found.length === patients.length ? `${patients.length} ${t('pacientes')}` : `${found.length} de ${patients.length}`}</span>
    </div>
    {found.length === 0 ? <p className="empty">No hay {t('pacientes')} que coincidan con «{query}».</p> : <>
      <div className="patient-table-scroll"><table>
        <thead><tr>
          <th scope="col" aria-sort={ariaSort('name')}><button type="button" onClick={() => toggle('name')}>Nombre{arrow('name')}</button></th>
          <th scope="col" className="col-dni">DNI</th>
          <th scope="col">Teléfono</th>
          <th scope="col" className="col-city">Localidad</th>
          <th scope="col" className="col-age" aria-sort={ariaSort('age')}><button type="button" onClick={() => toggle('age')}>Edad{arrow('age')}</button></th>
        </tr></thead>
        <tbody>{view.items.map(patient => <tr key={patient.id} onClick={() => onOpen(patient)}>
          <td><button type="button" className="patient-table-name" onClick={event => { event.stopPropagation(); onOpen(patient); }}>
            <span className="patient-table-avatar" aria-hidden="true">{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</span>
            {patient.firstName} {patient.lastName}
          </button></td>
          <td className="col-dni">{patient.dni || '—'}</td>
          <td>{patient.phone || '—'}</td>
          <td className="col-city">{patient.city || patient.province || '—'}</td>
          <td className="col-age">{patient.age ?? '—'}</td>
        </tr>)}</tbody>
      </table></div>
      {view.pages > 1 && <nav className="patient-table-pager" aria-label="Páginas">
        <button type="button" onClick={() => setPage(view.page - 1)} disabled={view.page === 1} aria-label="Página anterior">‹</button>
        {Array.from({ length: view.pages }, (_, index) => index + 1).map(number => <button key={number} type="button" aria-current={number === view.page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}
        <button type="button" onClick={() => setPage(view.page + 1)} disabled={view.page === view.pages} aria-label="Página siguiente">›</button>
      </nav>}
    </>}
  </div>;
}

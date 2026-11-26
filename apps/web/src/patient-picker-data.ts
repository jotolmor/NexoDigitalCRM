import { filterPatients, sortPatients, type TablePatient } from './patient-table-data.ts';

export const PICKER_LIMIT = 8;

/** Matches for the patient picker: empty until something is typed, sorted by surname, at most 8. */
export function pickerMatches<T extends TablePatient>(patients: T[], query: string, limit = PICKER_LIMIT): T[] {
  if (!query.trim()) return [];
  return sortPatients(filterPatients(patients, query), 'name', 'asc').slice(0, limit);
}

/** Next highlighted option for arrow keys; -1 means none. Wraps at both ends. */
export function moveHighlight(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

// Filtering, ordering and paging for the patient table; works on the list /patients already returns.

export type TablePatient = {
  id: string; firstName: string; lastName: string;
  dni?: string | null; phone?: string | null; email?: string | null; age?: number | null;
  city?: string | null; province?: string | null;
};
export type SortKey = 'name' | 'age';
export type SortDirection = 'asc' | 'desc';
export const PAGE_SIZE = 25;

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (value: string) => value.replace(/\D/g, '');

/** Every word of the query must match the name, surname, DNI or email, or — if it is only digits and phone signs, 3+ digits — the phone digits. */
export function filterPatients<T extends TablePatient>(patients: T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return patients;
  return patients.filter(patient => {
    const text = normalize([patient.firstName, patient.lastName, patient.dni, patient.email].filter(Boolean).join(' '));
    const phone = digits(patient.phone ?? '');
    return words.every(word => text.includes(word) || (/^[\d()+-]+$/.test(word) && digits(word).length >= 3 && phone.includes(digits(word))));
  });
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

export function sortPatients<T extends TablePatient>(patients: T[], key: SortKey, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...patients].sort((a, b) => {
    if (key === 'age') {
      const left = a.age ?? null, right = b.age ?? null;
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      if (left !== right) return (left - right) * sign;
    }
    const byName = collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
    return key === 'name' ? byName * sign : byName;
  });
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}

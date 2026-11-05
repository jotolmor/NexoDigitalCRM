export function clinicToday(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function patientAgeOnDate(dateOfBirth: Date | string, today: string): number | null {
  if (dateOfBirth instanceof Date && !Number.isFinite(dateOfBirth.getTime())) return null;
  const birth = dateOfBirth instanceof Date ? dateOfBirth.toISOString().slice(0, 10) : dateOfBirth;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth > today) return null;
  const parsed = new Date(birth + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth) return null;
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0);
  return age >= 0 && age <= 130 ? age : null;
}

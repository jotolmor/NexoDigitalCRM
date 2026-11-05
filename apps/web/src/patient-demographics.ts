export function patientAgeOnDate(birth: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth > today) return null;
  const parsed = new Date(birth + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth) return null;
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) - (today.slice(5) < birth.slice(5) ? 1 : 0);
  return age >= 0 && age <= 130 ? age : null;
}

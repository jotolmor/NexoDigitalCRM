export type DayAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string };
  professional: { id: string; firstName: string; lastName: string; specialty?: string };
  service?: { name: string; durationMinutes?: number } | null;
};

export function clinicDateKey(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function appointmentRoster(appointments: DayAppointment[]) {
  const byDoctor = new Map<string, { professional: DayAppointment['professional']; appointments: DayAppointment[] }>();
  const patients = new Map<string, { patient: DayAppointment['patient']; appointments: DayAppointment[] }>();
  const visible = appointments.filter(item => item.status !== 'CANCELLED')
    .slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  for (const item of visible) {
    let patientGroup = patients.get(item.patient.id);
    if (!patientGroup) {
      patientGroup = { patient: item.patient, appointments: [] };
      patients.set(item.patient.id, patientGroup);
    }
    patientGroup.appointments.push(item);
    let group = byDoctor.get(item.professional.id);
    if (!group) {
      group = { professional: item.professional, appointments: [] };
      byDoctor.set(item.professional.id, group);
    }
    group.appointments.push(item);
  }
  return { doctors: [...byDoctor.values()], patientGroups: [...patients.values()], patients: patients.size, total: visible.length };
}

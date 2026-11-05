export function contactPhone(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('00')) digits = digits.slice(2);
  else if (!value.trim().startsWith('+') && digits.length === 9) digits = '34' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
}
export function appointmentMessage(appointment: any, clinic: any, eventType: string) {
  const local = new Intl.DateTimeFormat('es-ES', { timeZone: clinic.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(appointment.startsAt);
  const patient = appointment.patient.firstName;
  const text = eventType === 'appointment.cancelled' ? `Hola ${patient}. Tu cita del ${local} en ${clinic.name} ha sido cancelada.`
    : eventType === 'appointment.rescheduled' ? `Hola ${patient}. Tu cita en ${clinic.name} se ha cambiado al ${local}.`
    : eventType === 'appointment.reminder' ? `Hola ${patient}. Te recordamos tu cita el ${local} en ${clinic.name}.`
    : eventType === 'appointment.created' ? `Hola ${patient}. Hemos registrado tu cita el ${local} en ${clinic.name}.`
    : `Hola ${patient}. Tu cita del ${local} en ${clinic.name} está confirmada.`;
  return { text, variables: { '1': patient, '2': local, '3': clinic.name }, startsAt: appointment.startsAt.toISOString() };
}

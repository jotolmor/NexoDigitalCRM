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
  const hour = Number(new Intl.DateTimeFormat('es-ES', { timeZone: clinic.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour >= 6 && hour < 14 ? 'buenos días' : hour >= 14 && hour < 21 ? 'buenas tardes' : 'buenas noches';
  const text = eventType === 'appointment.cancelled' ? `Hola ${patient}. Tu cita del ${local} en ${clinic.name} ha sido cancelada.`
    : eventType === 'appointment.rescheduled' ? `Hola ${patient}. Tu cita en ${clinic.name} se ha cambiado al ${local}.`
    : eventType === 'appointment.reminder' ? `Hola, ${greeting}, ${patient}. Le recordamos su cita en ${clinic.name} para el ${local}. Si no puede asistir, póngase en contacto con la clínica para cambiar o cancelar su cita. Muchas gracias.`
    : eventType === 'appointment.created' ? `Hola ${patient}. Hemos registrado tu cita el ${local} en ${clinic.name}.`
    : `Hola ${patient}. Tu cita del ${local} en ${clinic.name} está confirmada.`;
  return { text, variables: { '1': patient, '2': local, '3': clinic.name }, startsAt: appointment.startsAt.toISOString() };
}

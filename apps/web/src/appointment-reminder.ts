type ReminderAppointment = { startsAt: string; patient: { firstName: string; phone?: string | null } };
type ReminderClinic = { name?: string; timezone?: string };

export function reminderPhone(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('00')) digits = digits.slice(2);
  else if (!value.trim().startsWith('+') && digits.length === 9) digits = '34' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
}

export function patientReminder(appointment: ReminderAppointment, clinic: ReminderClinic, now = new Date()) {
  const timeZone = clinic.timezone || 'Europe/Madrid';
  const hour = Number(new Intl.DateTimeFormat('es-ES', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const greeting = hour >= 6 && hour < 14 ? 'buenos días' : hour >= 14 && hour < 21 ? 'buenas tardes' : 'buenas noches';
  const startsAt = new Date(appointment.startsAt);
  const date = new Intl.DateTimeFormat('es-ES', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(startsAt);
  const time = new Intl.DateTimeFormat('es-ES', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(startsAt);
  return `Hola, ${greeting}, ${appointment.patient.firstName}. Le recordamos su cita en ${clinic.name || 'nuestra clínica'} para el ${date} a las ${time}. Si no puede asistir, póngase en contacto con la clínica para cambiar o cancelar su cita. Muchas gracias.`;
}

export function reminderLinks(appointment: ReminderAppointment, clinic: ReminderClinic) {
  const phone = reminderPhone(appointment.patient.phone);
  if (!phone) return null;
  const body = encodeURIComponent(patientReminder(appointment, clinic));
  return { whatsapp: `https://wa.me/${phone.slice(1)}?text=${body}`, sms: `sms:${phone}?body=${body}` };
}

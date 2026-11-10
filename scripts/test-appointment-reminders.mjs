import assert from 'node:assert/strict';
import { patientReminder, reminderPhone, reminderLinks } from '../apps/web/src/appointment-reminder.ts';

const appointment = { startsAt: '2026-11-13T23:30:00Z', patient: { firstName: 'Álex', phone: '630 289 699' } };
const clinic = { name: 'Clínica Centro', timezone: 'Europe/Madrid' };
for (const [iso, greeting] of [
  ['2026-11-10T04:59:00Z', 'buenas noches'],
  ['2026-11-10T05:00:00Z', 'buenos días'],
  ['2026-11-10T12:59:00Z', 'buenos días'],
  ['2026-11-10T13:00:00Z', 'buenas tardes'],
  ['2026-11-10T19:59:00Z', 'buenas tardes'],
  ['2026-11-10T20:00:00Z', 'buenas noches'],
]) {
  const message = patientReminder(appointment, clinic, new Date(iso));
  assert.ok(message.startsWith(`Hola, ${greeting}, Álex.`));
  assert.ok(message.includes('en Clínica Centro para el 14 de noviembre de 2026 a las 00:30'));
  assert.ok(message.includes('Si no puede asistir, póngase en contacto con la clínica'));
}
assert.ok(patientReminder({ ...appointment, startsAt: '2026-07-10T08:00:00Z' }, clinic).includes('a las 10:00'));
for (const phone of ['630289699', '+34 630289699', '0034 630289699']) assert.equal(reminderPhone(phone), '+34630289699');
for (const phone of ['', 'abc', '+123', '0000']) assert.equal(reminderPhone(phone), null);
const links = reminderLinks(appointment, clinic);
assert.equal(new URL(links.whatsapp).pathname, '/34630289699');
assert.equal(new URL(links.whatsapp).searchParams.get('text'), new URL(links.sms).searchParams.get('body'));
assert.equal(reminderLinks({ ...appointment, patient: { firstName: 'Prueba' } }, clinic), null);
console.log('PASS: clinic-local greetings and appointment dates, daylight saving time, normalized phones and matching WhatsApp/SMS messages. No messages sent.');

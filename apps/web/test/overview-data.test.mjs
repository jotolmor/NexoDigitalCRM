import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentRoster, clinicDateKey } from '../src/overview-data.ts';

const appointment = (id, patient, professional, status = 'CONFIRMED', hour = '08') => ({
  id, patient: { id: patient, firstName: 'Paciente', lastName: 'Demo' },
  professional: { id: professional, firstName: 'Profesional', lastName: 'Demo' },
  startsAt: `2026-11-04T${hour}:00:00Z`, endsAt: `2026-11-04T${hour}:30:00Z`, status
});

test('counts unique doctors and patients rather than counting a patient twice', () => {
  const result = appointmentRoster([appointment('1', 'p1', 'd1'), appointment('2', 'p1', 'd1'), appointment('3', 'p2', 'd2')]);
  assert.equal(result.total, 3);
  assert.equal(result.patients, 2);
  assert.equal(result.doctors.length, 2);
  assert.equal(result.doctors[0].appointments.length, 2);
});
test('excludes cancelled appointments and doctors who only have cancelled appointments', () => {
  const result = appointmentRoster([appointment('1', 'p1', 'd1'), appointment('2', 'p2', 'd2', 'CANCELLED')]);
  assert.equal(result.total, 1);
  assert.equal(result.patients, 1);
  assert.equal(result.doctors.length, 1);
});
test('includes a doctor linked to an appointment without requiring an active-doctor directory entry', () => {
  assert.equal(appointmentRoster([appointment('1', 'p1', 'inactive-doctor')]).doctors[0].professional.id, 'inactive-doctor');
});
test('empty day has no doctors, patients or appointments', () => {
  assert.deepEqual(appointmentRoster([]), { doctors: [], patients: 0, total: 0 });
});
test('sorts appointments chronologically without mutating server data', () => {
  const data = [appointment('later', 'p1', 'd1', 'SCHEDULED', '15'), appointment('earlier', 'p1', 'd1', 'CONFIRMED', '08')];
  assert.equal(appointmentRoster(data).doctors[0].appointments[0].id, 'earlier');
  assert.equal(data[0].id, 'later');
});
test('today uses the clinic timezone, including midnight in winter and summer', () => {
  assert.equal(clinicDateKey(new Date('2026-11-03T23:30:00Z'), 'Europe/Madrid'), '2026-11-04');
  assert.equal(clinicDateKey(new Date('2026-07-03T22:30:00Z'), 'Europe/Madrid'), '2026-07-04');
});

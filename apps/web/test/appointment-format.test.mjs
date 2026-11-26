import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentWhen } from '../src/appointment-format.ts';

test('appointmentWhen shows day and time range in the clinic timezone, without seconds', () => {
  assert.equal(appointmentWhen('2026-11-27T08:15:00.000Z', '2026-11-27T08:45:00.000Z', 'Europe/Madrid'), 'vie 27 nov · 09:15–09:45');
  assert.equal(appointmentWhen('2026-07-01T07:00:00.000Z', '2026-07-01T08:00:00.000Z', 'Europe/Madrid'), 'mié 1 jul · 09:00–10:00');
  assert.equal(appointmentWhen('2026-11-27T14:00:00.000Z', '2026-11-27T14:30:00.000Z', 'America/New_York'), 'vie 27 nov · 09:00–09:30');
});

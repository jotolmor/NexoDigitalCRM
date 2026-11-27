import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDates, shiftDate, visibleRange, columnBlocks, slotFits, clinicTimeToIso, gridRows, normalizeDay } from '../src/agenda-grid.ts';

const professional = (overrides = {}) => ({
  id: 'p1', name: 'Clara Montoro', services: [], schedule: [], appointments: [], timeOff: [], freeSlots: [], ...overrides,
});
const appointment = (start, end) => ({
  id: 'a1', startsAt: '', endsAt: '', start, end, status: 'CONFIRMED',
  patient: { id: 'x', firstName: 'Leo', lastName: 'Naranjo' }, service: { id: 's', name: 'Extracción', durationMinutes: 30 },
});
const busyDay = () => professional({
  schedule: [{ startMinute: 540, endMinute: 660 }],
  appointments: [appointment('09:30', '10:00')],
  freeSlots: [{ startMinute: 540, endMinute: 570 }, { startMinute: 600, endMinute: 660 }],
});

test('weekDates returns Monday to Sunday, across months and years', () => {
  assert.deepEqual(weekDates('2026-11-26'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(weekDates('2026-12-31')[0], '2026-12-28');
  assert.equal(weekDates('2026-12-31')[6], '2027-01-03');
  assert.equal(weekDates('2026-11-29')[0], '2026-11-23');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('visibleRange defaults to 08:00-20:00 and widens to whole hours around shifts and appointments', () => {
  assert.deepEqual(visibleRange([]), { startMinute: 480, endMinute: 1200 });
  assert.deepEqual(visibleRange([
    professional({ schedule: [{ startMinute: 540, endMinute: 840 }] }),
    professional({ schedule: [{ startMinute: 600, endMinute: 1110 }] }),
  ]), { startMinute: 540, endMinute: 1140 });
  assert.equal(visibleRange([professional({ schedule: [{ startMinute: 480, endMinute: 840 }], appointments: [appointment('07:30', '08:00')] })]).startMinute, 420);
});

test('columnBlocks covers the range with closed, free 15-minute and appointment blocks', () => {
  const blocks = columnBlocks(busyDay(), { startMinute: 480, endMinute: 720 });
  assert.deepEqual(blocks.map(b => [b.kind, b.startMinute, b.endMinute]), [
    ['closed', 480, 540], ['free', 540, 555], ['free', 555, 570], ['appointment', 570, 600],
    ['free', 600, 615], ['free', 615, 630], ['free', 630, 645], ['free', 645, 660], ['closed', 660, 720],
  ]);
  assert.equal(blocks[3].appointment.patient.firstName, 'Leo');
});

test('columnBlocks greys out a day without shift and a whole-day absence', () => {
  assert.deepEqual(columnBlocks(professional(), { startMinute: 480, endMinute: 720 }).map(b => [b.kind, b.startMinute, b.endMinute]), [['closed', 480, 720]]);
  const absent = professional({ schedule: [{ startMinute: 540, endMinute: 660 }], timeOff: [{ start: '09:00', end: '11:00', reason: 'Formación' }] });
  assert.deepEqual(columnBlocks(absent, { startMinute: 480, endMinute: 720 }).map(b => [b.kind, b.startMinute, b.endMinute]), [
    ['closed', 480, 540], ['absence', 540, 660], ['closed', 660, 720],
  ]);
});

test('slotFits only accepts treatments that fit inside one free slot', () => {
  const day = busyDay();
  assert.equal(slotFits(day, 540, 30), true);
  assert.equal(slotFits(day, 555, 30), false);
  assert.equal(slotFits(day, 600, 60), true);
  assert.equal(slotFits(day, 630, 60), false);
});

test('clinicTimeToIso uses the clinic timezone, including daylight-saving changes', () => {
  assert.equal(clinicTimeToIso('2026-11-27', 540, 'Europe/Madrid'), '2026-11-27T08:00:00.000Z');
  assert.equal(clinicTimeToIso('2026-07-01', 540, 'Europe/Madrid'), '2026-07-01T07:00:00.000Z');
  assert.equal(clinicTimeToIso('2026-03-29', 600, 'Europe/Madrid'), '2026-03-29T08:00:00.000Z');
  assert.equal(clinicTimeToIso('2026-10-25', 600, 'Europe/Madrid'), '2026-10-25T09:00:00.000Z');
  assert.equal(clinicTimeToIso('2026-11-27', 540, 'America/New_York'), '2026-11-27T14:00:00.000Z');
});

test('columnBlocks keeps overlapping appointments side by side instead of hiding them', () => {
  const first = { ...appointment('09:00', '10:00'), id: 'a1', status: 'NO_SHOW' };
  const second = { ...appointment('09:30', '10:00'), id: 'a2' };
  const third = { ...appointment('09:00', '09:15'), id: 'a3' };
  const blocks = columnBlocks(professional({ schedule: [{ startMinute: 540, endMinute: 600 }], appointments: [first, second, third] }), { startMinute: 540, endMinute: 600 })
    .filter(block => block.kind === 'appointment');
  assert.deepEqual(blocks.map(b => [b.appointment.id, b.lane, b.lanes]).sort(), [['a1', 0, 2], ['a2', 1, 2], ['a3', 1, 2]]);
});

test('columnBlocks snaps free slots inward to 15-minute rows and gridRows never returns fractions', () => {
  const day = professional({ schedule: [{ startMinute: 540, endMinute: 600 }], freeSlots: [{ startMinute: 550, endMinute: 600 }], timeOff: [{ start: '09:00', end: '09:10' }] });
  const free = columnBlocks(day, { startMinute: 540, endMinute: 600 }).filter(b => b.kind === 'free');
  assert.deepEqual(free.map(b => [b.startMinute, b.endMinute]), [[555, 570], [570, 585], [585, 600]]);
  assert.deepEqual(gridRows({ startMinute: 580, endMinute: 640 }, 540), { row: 4, span: 5 });
  assert.deepEqual(gridRows({ startMinute: 540, endMinute: 550 }, 540), { row: 2, span: 1 });
});

test('normalizeDay fills missing lists so incomplete day data still renders', () => {
  const day = normalizeDay({ timezone: 'Europe/Madrid', professionals: [{ id: 'p1', name: 'Sin horario' }, { name: 'Sin id' }] }, '2026-11-04');
  assert.equal(day.date, '2026-11-04');
  assert.equal(day.professionals.length, 1);
  const [only] = day.professionals;
  for (const key of ['services', 'schedule', 'appointments', 'timeOff', 'freeSlots']) assert.deepEqual(only[key], [], key);
  assert.deepEqual(visibleRange(day.professionals), { startMinute: 480, endMinute: 1200 });
  assert.ok(columnBlocks(only, visibleRange(day.professionals)).length > 0);
  assert.deepEqual(normalizeDay(null, '2026-11-05'), { date: '2026-11-05', timezone: 'Europe/Madrid', professionals: [] });
  assert.deepEqual(normalizeDay({ professionals: 'x' }, '2026-11-05').professionals, []);
});

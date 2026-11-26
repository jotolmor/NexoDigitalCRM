import test from 'node:test';
import assert from 'node:assert/strict';
import { pickerMatches, moveHighlight } from '../src/patient-picker-data.ts';

const patients = Array.from({ length: 12 }, (_, index) => ({ id: String(index), firstName: index % 2 ? 'Lucía' : 'Leo', lastName: `García ${String(index).padStart(2, '0')}`, phone: `600 ${index}` }));

test('pickerMatches shows nothing until something is typed and at most 8 matches, sorted by surname', () => {
  assert.deepEqual(pickerMatches(patients, ''), []);
  assert.deepEqual(pickerMatches(patients, '   '), []);
  const many = pickerMatches(patients, 'garcia');
  assert.equal(many.length, 8);
  assert.equal(many[0].lastName, 'García 00');
  assert.deepEqual(pickerMatches(patients, 'lucia 03').map(item => item.id), ['3']);
  assert.deepEqual(pickerMatches(patients, 'nadie'), []);
});

test('moveHighlight wraps around and starts at the first or last option', () => {
  assert.equal(moveHighlight(-1, 3, 1), 0);
  assert.equal(moveHighlight(-1, 3, -1), 2);
  assert.equal(moveHighlight(2, 3, 1), 0);
  assert.equal(moveHighlight(0, 3, -1), 2);
  assert.equal(moveHighlight(1, 0, 1), -1);
});

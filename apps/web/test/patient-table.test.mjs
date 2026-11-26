import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPatients, sortPatients, paginate } from '../src/patient-table-data.ts';

const patients = [
  { id: '1', firstName: 'Lucía', lastName: 'García Pérez', dni: '12345678A', phone: '+34 600 11 22 33', email: 'lucia@example.com', age: 42 },
  { id: '2', firstName: 'Álvaro', lastName: 'Cobo', dni: null, phone: '(955) 123-456', email: null, age: null },
  { id: '3', firstName: 'Ana', lastName: 'aranda', dni: 'X1234567B', phone: null, email: 'ana@clinica.test', age: 7 },
];
const ids = list => list.map(item => item.id);

test('filterPatients ignores case and accents and matches name, surname, DNI, phone digits and email', () => {
  assert.deepEqual(ids(filterPatients(patients, '')), ['1', '2', '3']);
  assert.deepEqual(ids(filterPatients(patients, 'garcia')), ['1']);
  assert.deepEqual(ids(filterPatients(patients, 'ALVARO')), ['2']);
  assert.deepEqual(ids(filterPatients(patients, 'lucia perez')), ['1']);
  assert.deepEqual(ids(filterPatients(patients, 'x1234')), ['3']);
  assert.deepEqual(ids(filterPatients(patients, '600112')), ['1']);
  assert.deepEqual(ids(filterPatients(patients, '123-456')), ['2']);
  assert.deepEqual(ids(filterPatients(patients, 'clinica.test')), ['3']);
  assert.deepEqual(ids(filterPatients(patients, 'nadie')), []);
});

test('sortPatients orders by surname (accent and case aware) or by age with unknown ages last', () => {
  assert.deepEqual(ids(sortPatients(patients, 'name', 'asc')), ['3', '2', '1']);
  assert.deepEqual(ids(sortPatients(patients, 'name', 'desc')), ['1', '2', '3']);
  assert.deepEqual(ids(sortPatients(patients, 'age', 'asc')), ['3', '1', '2']);
  assert.deepEqual(ids(sortPatients(patients, 'age', 'desc')), ['1', '3', '2']);
});

test('paginate returns 25 per page and clamps the page number', () => {
  const many = Array.from({ length: 51 }, (_, index) => index);
  assert.deepEqual(paginate(many, 1, 25), { items: many.slice(0, 25), page: 1, pages: 3 });
  assert.deepEqual(paginate(many, 3, 25).items, [50]);
  assert.equal(paginate(many, 9, 25).page, 3);
  assert.deepEqual(paginate([], 1, 25), { items: [], page: 1, pages: 1 });
});

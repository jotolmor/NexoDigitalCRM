import { ConflictException, NotFoundException } from '@nestjs/common';
import { PreparedShift, ShiftChange, prepareShifts } from './shift-plan';

const expected = (error: unknown) => error instanceof ConflictException || error instanceof NotFoundException;
export function availableShiftChanges(raw: unknown, records: any[], professionals: any[]): { changes: PreparedShift[]; omittedCount: number; alternatives: PreparedShift[] } {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20) throw new ConflictException('Prepara entre 1 y 20 cambios de turnos.');
  try { return { changes: prepareShifts(raw, records, professionals), omittedCount: 0, alternatives: [] }; }
  catch (error) { if (!expected(error)) throw error; }
  // Keep related changes atomic: a removal must not survive a failed replacement.
  // Moves between professionals connect both groups, so swaps are checked together.
  const groups: { ids: Set<string>; changes: ShiftChange[] }[] = [];
  for (const change of raw as ShiftChange[]) {
    const source = records.find(record => record.id === change?.ruleId)?.professionalId;
    const ids = new Set<string>([source, change?.rule?.professionalId].filter(id => typeof id === 'string'));
    const linked = groups.filter(group => [...ids].some(id => group.ids.has(id)));
    const group = { ids: new Set([...ids, ...linked.flatMap(item => [...item.ids])]), changes: [...linked.flatMap(item => item.changes), change] };
    for (const item of linked) groups.splice(groups.indexOf(item), 1);
    groups.push(group);
  }
  const changes: PreparedShift[] = [];
  for (const group of groups) {
    try { changes.push(...prepareShifts(group.changes, records, professionals)); }
    catch (error) { if (!expected(error)) throw error; }
  }
  // Validate the combined proposal once more before exposing any confirmation.
  const checked = changes.length ? prepareShifts(changes, records, professionals) : [];
  return { changes: checked, omittedCount: raw.length - checked.length, alternatives: checked.length || raw.length !== 1 ? [] : alternativesFor(raw[0], records, professionals) };
}
function alternativesFor(change: ShiftChange, records: any[], professionals: any[]): PreparedShift[] {
  if (!change || !['create', 'update'].includes(change.kind) || !change.rule) return [];
  const requested = change.rule;
  const duration = requested.endsAtMinute - requested.startsAtMinute;
  if (!Number.isInteger(duration) || duration < 15 || duration > 300 || duration % 15) return [];
  const starts = [540, 600, 660, 720, 780, 960, 1020, 1080, 1140, 1200].sort((a, b) => Math.abs(a - requested.startsAtMinute) - Math.abs(b - requested.startsAtMinute));
  const options: PreparedShift[] = [];
  for (const start of starts) {
    try {
      const candidate = { ...change, rule: { ...requested, startsAtMinute: start, endsAtMinute: start + duration } };
      options.push(prepareShifts([candidate], records, professionals)[0]);
      if (options.length === 5) break;
    } catch (error) { if (!expected(error)) throw error; }
  }
  return options;
}

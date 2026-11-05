import { ConflictException, NotFoundException } from '@nestjs/common';
import { PreparedShift, prepareShifts, shiftSnapshot, ShiftInput } from './shift-plan';
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const label = (rule: ShiftInput) => `${days[rule.weekday]} ${time(rule.startsAtMinute)}–${time(rule.endsAtMinute)} (${rule.validFrom} a ${rule.validTo})`;
/** Exchange the complete windows while keeping each rule assigned to its original professional. */
export function prepareShiftSwap(firstId: string, secondId: string, records: any[], professionals: any[]): PreparedShift[] {
  const first = records.find(rule => rule.id === firstId), second = records.find(rule => rule.id === secondId);
  if (!first || !second) throw new NotFoundException('Consulta los dos turnos activos de esta clínica antes de preparar el intercambio.');
  if (first.id === second.id || first.professionalId === second.professionalId) throw new ConflictException('Selecciona turnos de dos profesionales diferentes.');
  const a = shiftSnapshot(first), b = shiftSnapshot(second);
  const changes = prepareShifts([
    { kind: 'update', ruleId: a.id, rule: { ...b, professionalId: a.professionalId } },
    { kind: 'update', ruleId: b.id, rule: { ...a, professionalId: b.professionalId } }
  ], records, professionals);
  return changes.map(change => {
    const professional = professionals.find(person => person.id === change.rule!.professionalId);
    return { ...change, summary: `Intercambiar: ${professional.firstName} ${professional.lastName} · Antes: ${label(change.before!)} · Después: ${label(change.rule!)}` };
  });
}
export function requiresColleagueAgreement(changes: PreparedShift[]) {
  const ids = new Set(changes.flatMap(change => [change.before?.professionalId, change.rule?.professionalId].filter((id): id is string => Boolean(id))));
  return changes.some(change => Boolean(change.before)) && ids.size > 1;
}

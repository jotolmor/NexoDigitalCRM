import { ConflictException, NotFoundException } from '@nestjs/common';

export type ShiftInput = { professionalId: string; weekday: number; startsAtMinute: number; endsAtMinute: number; validFrom: string; validTo: string };
export type ShiftChange = { kind: 'create' | 'update' | 'remove'; ruleId?: string; rule?: ShiftInput };
export type ShiftSnapshot = ShiftInput & { id: string };
export type PreparedShift = ShiftChange & { before?: ShiftSnapshot; summary: string };
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export function shiftSnapshot(rule: any): ShiftSnapshot {
  return { id: rule.id, professionalId: rule.professionalId, weekday: rule.weekday, startsAtMinute: rule.startsAtMinute, endsAtMinute: rule.endsAtMinute, validFrom: new Date(rule.validFrom).toISOString().slice(0, 10), validTo: new Date(rule.validTo).toISOString().slice(0, 10) };
}
export function validShift(input: unknown): ShiftInput {
  const x = input as ShiftInput;
  if (!x || typeof x.professionalId !== 'string' || !x.professionalId || ![x.weekday, x.startsAtMinute, x.endsAtMinute].every(Number.isInteger)) throw new ConflictException('Faltan datos válidos del turno.');
  const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const duration = x.endsAtMinute - x.startsAtMinute;
  const morning = x.startsAtMinute >= 540 && x.startsAtMinute <= 780 && x.endsAtMinute <= 840;
  const afternoon = x.startsAtMinute >= 960 && x.startsAtMinute <= 1200 && x.endsAtMinute <= 1260;
  if (!validDate(x.validFrom) || !validDate(x.validTo) || x.validFrom > x.validTo || x.weekday < 1 || x.weekday > 5 || x.startsAtMinute % 60 !== 0 || x.endsAtMinute % 15 !== 0 || duration < 15 || duration > 300 || (!morning && !afternoon)) throw new ConflictException('Revisa el turno: lunes a viernes, inicio por hora de 09:00 a 13:00 o de 16:00 a 20:00, fin cada 15 minutos hasta 14:00 o 21:00 y duración máxima de 5 horas. Revisa también las fechas de vigencia.');
  return { professionalId: x.professionalId, weekday: x.weekday, startsAtMinute: x.startsAtMinute, endsAtMinute: x.endsAtMinute, validFrom: x.validFrom, validTo: x.validTo };
}
export function prepareShifts(raw: unknown, records: any[], professionals: any[], checkBefore = false): PreparedShift[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20) throw new ConflictException('Prepara entre 1 y 20 cambios de turnos.');
  const current = records.map(shiftSnapshot);
  const seen = new Set<string>();
  const prepared = raw.map((change: ShiftChange & { before?: ShiftSnapshot }) => {
    if (!change || !['create', 'update', 'remove'].includes(change.kind)) throw new ConflictException('Acción de turno no válida.');
    let before: ShiftSnapshot | undefined;
    if (change.kind !== 'create') {
      if (!change.ruleId || seen.has(change.ruleId)) throw new ConflictException('Un turno no se puede modificar dos veces en la misma propuesta.');
      seen.add(change.ruleId); before = current.find(rule => rule.id === change.ruleId);
      if (!before) throw new NotFoundException('El turno ya no está activo en esta clínica.');
      if (checkBefore && JSON.stringify(before) !== JSON.stringify(change.before)) throw new ConflictException('El turno cambió desde la propuesta. Consulta y prepara una nueva acción.');
    }
    const rule = change.kind === 'remove' ? undefined : validShift(change.rule);
    const effective = rule ?? before!;
    const professional = professionals.find(person => person.id === effective.professionalId);
    if (!professional) throw new NotFoundException('Profesional activo no encontrado en esta clínica.');
    const summary = `${change.kind === 'create' ? 'Asignar' : change.kind === 'update' ? 'Modificar' : 'Retirar'}: ${professional.firstName} ${professional.lastName} · ${weekdays[effective.weekday]} · ${time(effective.startsAtMinute)}–${time(effective.endsAtMinute)} · ${effective.validFrom} a ${effective.validTo}`;
    return { kind: change.kind, ...(before ? { ruleId: before.id, before } : {}), ...(rule ? { rule } : {}), summary };
  });
  const future = [...current.filter(rule => !seen.has(rule.id)), ...prepared.flatMap((change, index) => change.rule ? [{ ...change.rule, id: change.ruleId ?? `new-${index}` }] : [])];
  const changedIds = new Set(prepared.flatMap((change, index) => change.rule ? [change.ruleId ?? `new-${index}`] : []));
  for (let i = 0; i < future.length; i++) for (let j = i + 1; j < future.length; j++) {
    const a = future[i], b = future[j];
    // Only proposed shifts need validation against the existing roster.
    if (!changedIds.has(a.id) && !changedIds.has(b.id)) continue;
    if (a.professionalId === b.professionalId && a.weekday === b.weekday && a.validFrom <= b.validTo && a.validTo >= b.validFrom && a.startsAtMinute < b.endsAtMinute && a.endsAtMinute > b.startsAtMinute) throw new ConflictException('La propuesta contiene turnos solapados para el mismo profesional.');
  }
  return prepared;
}

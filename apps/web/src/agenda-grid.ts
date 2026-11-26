// Pure helpers for the day and week agenda: dates, visible hours, grid blocks and clinic-time conversion.

export type AgendaAppointment = {
  id: string; startsAt: string; endsAt: string; start: string; end: string; status: string;
  patient: { id: string; firstName: string; lastName: string };
  service?: { id: string; name: string; durationMinutes: number } | null;
};
export type DayProfessional = {
  id: string; name: string; specialty?: string;
  services: { id: string; name: string; durationMinutes: number }[];
  schedule: { startMinute: number; endMinute: number }[];
  appointments: AgendaAppointment[];
  timeOff: { start: string; end: string; reason?: string | null }[];
  freeSlots: { startMinute: number; endMinute: number }[];
};
export type DayData = { date: string; timezone: string; professionals: DayProfessional[] };
export type Block = { kind: 'appointment' | 'free' | 'absence' | 'closed'; startMinute: number; endMinute: number; appointment?: AgendaAppointment };
type Range = { startMinute: number; endMinute: number };

export const SLOT_MINUTES = 15;
const DEFAULT_RANGE: Range = { startMinute: 8 * 60, endMinute: 20 * 60 };

export function minuteOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function weekDates(date: string): string[] {
  const [year, month, day] = date.split('-').map(Number);
  const mondayOffset = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDate(date, index - mondayOffset));
}

export function visibleRange(professionals: DayProfessional[]): Range {
  const starts: number[] = []; const ends: number[] = [];
  for (const professional of professionals) {
    for (const range of professional.schedule) { starts.push(range.startMinute); ends.push(range.endMinute); }
    for (const item of professional.appointments) { starts.push(minuteOf(item.start)); ends.push(minuteOf(item.end) || 1440); }
  }
  if (!starts.length) return { ...DEFAULT_RANGE };
  return { startMinute: Math.floor(Math.min(...starts) / 60) * 60, endMinute: Math.min(1440, Math.ceil(Math.max(...ends) / 60) * 60) };
}

export function columnBlocks(professional: DayProfessional, range: Range): Block[] {
  const placed: Block[] = [];
  for (const item of professional.appointments) {
    placed.push({ kind: 'appointment', startMinute: minuteOf(item.start), endMinute: minuteOf(item.end) || 1440, appointment: item });
  }
  for (const slot of professional.freeSlots) {
    for (let minute = slot.startMinute; minute < slot.endMinute; minute += SLOT_MINUTES) {
      placed.push({ kind: 'free', startMinute: minute, endMinute: Math.min(minute + SLOT_MINUTES, slot.endMinute) });
    }
  }
  const absences = professional.timeOff.map(item => ({ startMinute: minuteOf(item.start), endMinute: minuteOf(item.end) || 1440 }));
  const visible = placed
    .map(block => ({ ...block, startMinute: Math.max(block.startMinute, range.startMinute), endMinute: Math.min(block.endMinute, range.endMinute) }))
    .filter(block => block.endMinute > block.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  // Fill every gap with grey: absence where an absence overlaps the shift, closed otherwise.
  const blocks: Block[] = [];
  const fill = (from: number, to: number) => {
    for (let minute = from; minute < to; minute += SLOT_MINUTES) {
      const end = Math.min(minute + SLOT_MINUTES, to);
      const kind = absences.some(item => item.startMinute < end && item.endMinute > minute)
        && professional.schedule.some(item => item.startMinute < end && item.endMinute > minute) ? 'absence' : 'closed';
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind && last.endMinute === minute) last.endMinute = end;
      else blocks.push({ kind, startMinute: minute, endMinute: end });
    }
  };
  let cursor = range.startMinute;
  for (const block of visible) {
    if (block.startMinute < cursor) continue;
    fill(cursor, block.startMinute);
    blocks.push(block);
    cursor = block.endMinute;
  }
  fill(cursor, range.endMinute);
  return blocks;
}

export function slotFits(professional: DayProfessional, startMinute: number, durationMinutes: number): boolean {
  return professional.freeSlots.some(slot => slot.startMinute <= startMinute && startMinute + durationMinutes <= slot.endMinute);
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - instant;
}

/** Converts a wall-clock time in the clinic's timezone to an ISO instant. */
export function clinicTimeToIso(date: string, minute: number, timezone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const naive = Date.UTC(year, month - 1, day, 0, minute);
  let instant = naive - zoneOffsetMs(naive, timezone);
  instant = naive - zoneOffsetMs(instant, timezone);
  return new Date(instant).toISOString();
}

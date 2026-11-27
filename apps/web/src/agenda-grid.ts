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
export type Block = { kind: 'appointment' | 'free' | 'absence' | 'closed'; startMinute: number; endMinute: number; appointment?: AgendaAppointment; lane?: number; lanes?: number };
type Range = { startMinute: number; endMinute: number };

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

/** Fills in missing lists so an incomplete /dashboard/day response cannot break the agenda. */
export function normalizeDay(raw: unknown, date: string): DayData {
  const day = (raw && typeof raw === 'object' ? raw : {}) as Partial<DayData>;
  return {
    date: typeof day.date === 'string' ? day.date : date,
    timezone: typeof day.timezone === 'string' ? day.timezone : 'Europe/Madrid',
    professionals: list<Partial<DayProfessional>>(day.professionals)
      .filter(item => item && typeof item.id === 'string')
      .map(item => ({
        ...item, id: item.id as string, name: item.name ?? '',
        services: list(item.services), schedule: list(item.schedule), appointments: list(item.appointments),
        timeOff: list(item.timeOff), freeSlots: list(item.freeSlots),
      })),
  };
}

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
  const clamp = (from: number, to: number) => ({ startMinute: Math.max(from, range.startMinute), endMinute: Math.min(to, range.endMinute) });
  // Appointments never hide each other: overlapping ones share the column in lanes.
  const appointments = professional.appointments
    .map(item => ({ kind: 'appointment' as const, ...clamp(minuteOf(item.start), minuteOf(item.end) || 1440), appointment: item }))
    .filter(block => block.endMinute > block.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const placed: Block[] = [];
  let cluster: Block[] = []; let laneEnds: number[] = []; let clusterEnd = -1;
  const closeCluster = () => { for (const block of cluster) block.lanes = laneEnds.length; cluster = []; laneEnds = []; };
  for (const block of appointments) {
    if (block.startMinute >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex(endMinute => endMinute <= block.startMinute);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(block.endMinute); } else laneEnds[lane] = block.endMinute;
    const laid: Block = { ...block, lane };
    cluster.push(laid); placed.push(laid);
    clusterEnd = Math.max(clusterEnd, block.endMinute);
  }
  closeCluster();

  // Free slots snap inward to whole 15-minute rows so every block sits on the grid.
  for (const slot of professional.freeSlots) {
    const from = Math.ceil(Math.max(slot.startMinute, range.startMinute) / SLOT_MINUTES) * SLOT_MINUTES;
    const to = Math.floor(Math.min(slot.endMinute, range.endMinute) / SLOT_MINUTES) * SLOT_MINUTES;
    for (let minute = from; minute + SLOT_MINUTES <= to; minute += SLOT_MINUTES) {
      if (!appointments.some(item => item.startMinute < minute + SLOT_MINUTES && item.endMinute > minute)) placed.push({ kind: 'free', startMinute: minute, endMinute: minute + SLOT_MINUTES });
    }
  }

  // Everything not covered is grey: absence where an absence overlaps the shift, closed otherwise.
  const absences = professional.timeOff.map(item => ({ startMinute: minuteOf(item.start), endMinute: minuteOf(item.end) || 1440 }));
  const covered = [...placed].sort((a, b) => a.startMinute - b.startMinute);
  const grey: Block[] = [];
  const fill = (from: number, to: number) => {
    for (let minute = from; minute < to; minute = Math.min(to, (Math.floor(minute / SLOT_MINUTES) + 1) * SLOT_MINUTES)) {
      const end = Math.min(to, (Math.floor(minute / SLOT_MINUTES) + 1) * SLOT_MINUTES);
      const kind = absences.some(item => item.startMinute < end && item.endMinute > minute)
        && professional.schedule.some(item => item.startMinute < end && item.endMinute > minute) ? 'absence' : 'closed';
      const last = grey[grey.length - 1];
      if (last && last.kind === kind && last.endMinute === minute) last.endMinute = end;
      else grey.push({ kind, startMinute: minute, endMinute: end });
    }
  };
  let cursor = range.startMinute;
  for (const block of covered) {
    if (block.startMinute > cursor) fill(cursor, block.startMinute);
    cursor = Math.max(cursor, block.endMinute);
  }
  fill(cursor, range.endMinute);
  return [...placed, ...grey].sort((a, b) => a.startMinute - b.startMinute || (a.lane ?? 0) - (b.lane ?? 0));
}

/** CSS grid row (row 1 is the header) and span for a block; partial rows round outward. */
export function gridRows(block: { startMinute: number; endMinute: number }, firstMinute: number): { row: number; span: number } {
  const first = Math.floor((block.startMinute - firstMinute) / SLOT_MINUTES);
  const last = Math.ceil((block.endMinute - firstMinute) / SLOT_MINUTES);
  return { row: first + 2, span: Math.max(1, last - first) };
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

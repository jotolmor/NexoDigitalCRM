import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { columnBlocks, formatMinute, gridRows, normalizeDay, shiftDate, SLOT_MINUTES, visibleRange, weekDates, type Block, type DayData, type DayProfessional } from './agenda-grid';
import { AgendaSlotPanel, longDate, statusLabels, type PanelTarget } from './agenda-slot-panel';
import './day-week-agenda.css';

type Props = {
  scope: string[]; date: string; today: string; canWrite: boolean; onDateChange: (date: string) => void;
  load: (path: string) => Promise<any>; write: (path: string, body: unknown, method?: 'PATCH') => Promise<any>;
};
type Column = { key: string; title: string; subtitle?: string; date: string; professional?: DayProfessional; highlight?: boolean };

const REFRESH_KEYS = [['appointments'], ['calendar'], ['calendar-day'], ['summary'], ['appointment-availability']];

export function DayWeekAgenda({ scope, date, today, canWrite, onDateChange, load, write }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [professionalId, setProfessionalId] = useState('');
  // The panel keeps the timezone of the day it was opened from, never a fallback.
  const [open, setOpen] = useState<{ target: PanelTarget; timezone: string; opener: HTMLElement | null } | null>(null);
  const dates = mode === 'day' ? [date] : weekDates(date);
  const days = useQueries({
    queries: dates.map(item => ({ queryKey: ['calendar-day', 'agenda', ...scope, item], queryFn: async (): Promise<DayData> => normalizeDay(await load('/dashboard/day?date=' + item), item) })),
  });
  const patients = useQuery({ queryKey: ['patients-agenda'], queryFn: () => load('/patients') });
  const closePanel = useCallback(() => { setOpen(current => { current?.opener?.focus(); return null; }); }, []);
  useEffect(() => { setOpen(null); }, [date, mode]);
  const done = useCallback(async () => {
    closePanel();
    await Promise.all(REFRESH_KEYS.map(queryKey => qc.invalidateQueries({ queryKey })));
  }, [qc, closePanel]);

  const loading = days.some(day => day.isPending);
  const failed = days.find(day => day.error);
  const data = days.map(day => day.data).filter((day): day is DayData => Boolean(day));
  const roster = data[0]?.professionals ?? [];
  const selectedId = roster.some(item => item.id === professionalId) ? professionalId : roster[0]?.id ?? '';

  let columns: Column[] = [];
  if (!loading && !failed) {
    columns = mode === 'day'
      ? (data[0]?.professionals ?? []).map(professional => ({ key: professional.id, title: professional.name, subtitle: professional.specialty, date, professional }))
      : data.map(day => ({ key: day.date, title: shortDate(day.date), date: day.date, highlight: day.date === today, professional: day.professionals.find(item => item.id === selectedId) }));
  }
  const range = visibleRange(columns.map(column => column.professional).filter((item): item is DayProfessional => Boolean(item)));
  const rows = (range.endMinute - range.startMinute) / SLOT_MINUTES;
  const step = mode === 'day' ? 1 : 7;

  return <section className="panel day-week-agenda" aria-label="Agenda">
    <header className="agenda-toolbar">
      <div className="agenda-nav">
        <button type="button" aria-label={mode === 'day' ? 'Día anterior' : 'Semana anterior'} onClick={() => onDateChange(shiftDate(date, -step))}>‹</button>
        <button type="button" onClick={() => onDateChange(today)} disabled={date === today}>Hoy</button>
        <button type="button" aria-label={mode === 'day' ? 'Día siguiente' : 'Semana siguiente'} onClick={() => onDateChange(shiftDate(date, step))}>›</button>
        <h2>{mode === 'day' ? longDate(date) : `Semana del ${shortDate(dates[0])} al ${shortDate(dates[6])}`}</h2>
      </div>
      <div className="agenda-options">
        <div className="agenda-mode" role="group" aria-label="Vista">
          <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Día</button>
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Semana</button>
        </div>
        {mode === 'week' && roster.length > 0 && <label className="agenda-professional">Profesional
          <select value={selectedId} onChange={event => setProfessionalId(event.target.value)}>
            {roster.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </div>
    </header>
    {loading && <p role="status">Cargando agenda…</p>}
    {failed && <p className="error" role="alert">{failed.error instanceof Error ? failed.error.message : 'No se pudo cargar la agenda.'}</p>}
    {!loading && !failed && roster.length === 0 && <p>No hay profesionales activos.</p>}
    {!loading && !failed && roster.length > 0 && <div className="agenda-scroll">
      <div className="agenda-grid" style={{ '--agenda-columns': columns.length, '--agenda-rows': rows } as CSSProperties}>
        <div className="agenda-corner" />
        {columns.map((column, index) => <div key={column.key} className={'agenda-column-title' + (column.highlight ? ' is-today' : '')} style={{ gridColumn: index + 2 }}>
          <strong>{column.title}</strong>{column.subtitle && <small>{column.subtitle}</small>}
        </div>)}
        {Array.from({ length: rows / 4 }, (_, hour) => <div key={hour} className="agenda-hour" style={{ gridRow: `${hour * 4 + 2} / span 4` }}>
          {formatMinute(range.startMinute + hour * 60)}
        </div>)}
        {columns.map((column, index) => (column.professional ? columnBlocks(column.professional, range) : [{ kind: 'closed', startMinute: range.startMinute, endMinute: range.endMinute } as Block])
          .map(block => <AgendaBlock key={`${column.key}-${block.startMinute}`} block={block} column={index + 2} firstMinute={range.startMinute}
            label={`${shortDate(column.date)}, ${column.professional?.name ?? ''}`} canWrite={canWrite}
            onPick={opener => {
              const professional = column.professional;
              const timezone = data.find(day => day.date === column.date)?.timezone;
              if (!professional || !timezone) return;
              if (block.kind === 'free') setOpen({ timezone, opener, target: { kind: 'slot', date: column.date, startMinute: block.startMinute, professional } });
              if (block.kind === 'appointment' && block.appointment) setOpen({ timezone, opener, target: { kind: 'appointment', date: column.date, professional, appointment: block.appointment } });
            }} />))}
      </div>
    </div>}
    {open && <AgendaSlotPanel key={open.target.kind === 'slot' ? `${open.target.date}-${open.target.startMinute}-${open.target.professional.id}` : open.target.appointment.id}
      target={open.target} timezone={open.timezone} canWrite={canWrite} patients={patients.data ?? []} patientsError={patients.error instanceof Error ? patients.error.message : ''} write={write} onDone={done} onClose={closePanel} />}
  </section>;
}

function AgendaBlock({ block, column, firstMinute, label, canWrite, onPick }: { block: Block; column: number; firstMinute: number; label: string; canWrite: boolean; onPick: (opener: HTMLElement) => void }) {
  const { row, span } = gridRows(block, firstMinute);
  const style: CSSProperties = { gridColumn: column, gridRow: `${row} / span ${span}` };
  if (block.kind === 'free') {
    if (!canWrite) return <div className="agenda-block agenda-free is-readonly" style={style} aria-hidden="true" />;
    return <button type="button" className="agenda-block agenda-free" style={style} aria-label={`Reservar ${formatMinute(block.startMinute)}, ${label}`} onClick={event => onPick(event.currentTarget)}>
      <span>{formatMinute(block.startMinute)}</span>
    </button>;
  }
  if (block.kind === 'appointment' && block.appointment) {
    const item = block.appointment;
    const lanes = block.lanes ?? 1;
    if (lanes > 1) Object.assign(style, { width: `calc(${100 / lanes}% - 6px)`, marginLeft: `calc(${(block.lane ?? 0) * 100 / lanes}% + 3px)`, justifySelf: 'start' });
    return <button type="button" className={`agenda-block agenda-appointment status-${item.status.toLowerCase()}${block.endMinute - block.startMinute <= SLOT_MINUTES ? ' is-short' : ''}`} style={style} onClick={event => onPick(event.currentTarget)}
      aria-label={`${item.patient.firstName} ${item.patient.lastName}, ${label}, ${item.start}–${item.end}${item.service ? `, ${item.service.name}` : ''}, ${statusLabels[item.status] ?? item.status}`}>
      <strong>{item.patient.firstName} {item.patient.lastName}</strong>
      <span>{item.start}–{item.end}{item.service ? ` · ${item.service.name}` : ''}</span>
    </button>;
  }
  if (block.kind === 'absence') return <div className="agenda-block agenda-absence" style={style} role="img" aria-label={`Ausencia, ${label}`} title="Ausencia" />;
  return <div className="agenda-block agenda-closed" style={style} aria-hidden="true" />;
}

function shortDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

import { useCallback, useState, type CSSProperties } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { columnBlocks, formatMinute, shiftDate, SLOT_MINUTES, visibleRange, weekDates, type Block, type DayData, type DayProfessional } from './agenda-grid';
import { AgendaSlotPanel, longDate, statusLabels, type PanelTarget } from './agenda-slot-panel';
import './day-week-agenda.css';

type Props = {
  scope: string[]; date: string; today: string; onDateChange: (date: string) => void;
  load: (path: string) => Promise<any>; write: (path: string, body: unknown, method?: 'PATCH') => Promise<any>;
};
type Column = { key: string; title: string; subtitle?: string; date: string; professional?: DayProfessional; highlight?: boolean };

const REFRESH_KEYS = [['appointments'], ['calendar'], ['calendar-day'], ['summary'], ['appointment-availability']];

export function DayWeekAgenda({ scope, date, today, onDateChange, load, write }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [professionalId, setProfessionalId] = useState('');
  const [target, setTarget] = useState<PanelTarget | null>(null);
  const dates = mode === 'day' ? [date] : weekDates(date);
  const days = useQueries({
    queries: dates.map(item => ({ queryKey: ['calendar-day', 'agenda', ...scope, item], queryFn: () => load('/dashboard/day?date=' + item) as Promise<DayData> })),
  });
  const patients = useQuery({ queryKey: ['patients-agenda'], queryFn: () => load('/patients') });
  const closePanel = useCallback(() => setTarget(null), []);
  const done = useCallback(async () => {
    setTarget(null);
    await Promise.all(REFRESH_KEYS.map(queryKey => qc.invalidateQueries({ queryKey })));
  }, [qc]);

  const loading = days.some(day => day.isPending);
  const failed = days.find(day => day.error);
  const data = days.map(day => day.data).filter((day): day is DayData => Boolean(day));
  const timezone = data[0]?.timezone ?? 'Europe/Madrid';
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
            professionalName={column.professional?.name ?? ''}
            onPick={() => {
              if (!column.professional) return;
              if (block.kind === 'free') setTarget({ kind: 'slot', date: column.date, startMinute: block.startMinute, professional: column.professional });
              if (block.kind === 'appointment' && block.appointment) setTarget({ kind: 'appointment', date: column.date, professional: column.professional, appointment: block.appointment });
            }} />))}
      </div>
    </div>}
    {target && <AgendaSlotPanel key={target.kind === 'slot' ? `${target.date}-${target.startMinute}-${target.professional.id}` : target.appointment.id}
      target={target} timezone={timezone} patients={patients.data ?? []} write={write} onDone={done} onClose={closePanel} />}
  </section>;
}

function AgendaBlock({ block, column, firstMinute, professionalName, onPick }: { block: Block; column: number; firstMinute: number; professionalName: string; onPick: () => void }) {
  const style = { gridColumn: column, gridRow: `${(block.startMinute - firstMinute) / SLOT_MINUTES + 2} / span ${Math.max(1, Math.round((block.endMinute - block.startMinute) / SLOT_MINUTES))}` };
  if (block.kind === 'free') {
    return <button type="button" className="agenda-block agenda-free" style={style} aria-label={`Reservar ${formatMinute(block.startMinute)} con ${professionalName}`} onClick={onPick}>
      <span>{formatMinute(block.startMinute)}</span>
    </button>;
  }
  if (block.kind === 'appointment' && block.appointment) {
    const item = block.appointment;
    return <button type="button" className={`agenda-block agenda-appointment status-${item.status.toLowerCase()}${block.endMinute - block.startMinute <= SLOT_MINUTES ? ' is-short' : ''}`} style={style} onClick={onPick}
      aria-label={`${item.patient.firstName} ${item.patient.lastName}, ${item.start}–${item.end}${item.service ? `, ${item.service.name}` : ''}, ${statusLabels[item.status] ?? item.status}`}>
      <strong>{item.patient.firstName} {item.patient.lastName}</strong>
      <span>{item.start}–{item.end}{item.service ? ` · ${item.service.name}` : ''}</span>
    </button>;
  }
  return <div className={`agenda-block agenda-${block.kind}`} style={style} aria-hidden="true" title={block.kind === 'absence' ? 'Ausencia' : undefined} />;
}

function shortDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

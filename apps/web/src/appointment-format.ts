/** «vie 27 nov · 09:15–09:45» in the clinic's timezone. */
export function appointmentWhen(startsAt: string, endsAt: string, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(new Date(startsAt)).map(part => [part.type, part.value.replace('.', '')]));
  const time = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  return `${parts.weekday} ${parts.day} ${parts.month} · ${time(startsAt)}–${time(endsAt)}`;
}

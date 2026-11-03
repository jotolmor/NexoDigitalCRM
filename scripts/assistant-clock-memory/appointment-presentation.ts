export function appointmentPresentation<T extends { startsAt: Date | string; endsAt: Date | string }>(appointment: T, timezone: string) {
  const format = (value: Date | string) => {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)!.value;
    const [year, month, day, hour, minute, second] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(get);
    const localAsUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
    const offset = Math.round((localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    const offsetText = `${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
    return {
      iso: `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetText}`,
      label: `${year}-${month}-${day} ${hour}:${minute}`
    };
  };
  const start = format(appointment.startsAt);
  const end = format(appointment.endsAt);
  return { ...appointment, startsAt: start.iso, endsAt: end.iso,
    localStart: start.label, localEnd: end.label, timezone };
}

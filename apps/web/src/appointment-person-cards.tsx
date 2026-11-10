import type { MouseEvent } from 'react';
import type { appointmentRoster, DayAppointment } from './overview-data';
import './appointment-person-cards.css';

export type PersonSubject = { kind: 'doctor' | 'patient'; id: string };
type Props = {
  roster: ReturnType<typeof appointmentRoster>;
  timezone: string;
  onDetails: (event: MouseEvent<HTMLButtonElement>, subject: PersonSubject) => void;
};

export function AppointmentPersonCards({ roster, timezone, onDetails }: Props) {
  const time = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));

  function card(subject: PersonSubject, firstName: string, lastName: string, description: string, appointments: DayAppointment[]) {
    const name = `${firstName} ${lastName}`.trim();
    const first = appointments[0];
    return <article className={`person-card person-card-${subject.kind}`} key={subject.id} data-person-kind={subject.kind} data-person-id={subject.id}>
      <span className="person-card-avatar" aria-hidden="true">{firstName.charAt(0)}{lastName.charAt(0)}</span>
      <div className="person-card-copy"><h4>{name}</h4><p>{description}</p></div>
      <div className="person-card-meta"><span className="person-card-count">{appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}</span><span className="person-card-time">{appointments.length > 1 ? 'Primera cita · ' : ''}<time dateTime={first.startsAt}>{time(first.startsAt)}–{time(first.endsAt)}</time></span></div>
      <button type="button" className="secondary person-card-details" aria-label={`Detalles de citas de ${name}`} aria-haspopup="dialog" onClick={event => onDetails(event, subject)}>
        <span>Detalles de citas</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z" /><path d="M7 9h9m-9 5h6" /></svg>
      </button>
    </article>;
  }

  return <div className="person-roster-groups">
    <section className="panel person-roster-group" aria-label="Doctores con citas">
      <div className="person-roster-heading"><h3>Doctores con citas</h3><span>{roster.doctors.length} profesionales · {timezone}</span></div>{!roster.total && <p className="overview-empty">No hay citas para este día.</p>}<div className="person-card-list">{roster.doctors.map(({ professional, appointments }) => card({ kind: 'doctor', id: professional.id }, professional.firstName, professional.lastName, professional.specialty || 'Profesional', appointments))}</div>
    </section>
    <section className="panel person-roster-group" aria-label="Pacientes con citas">
      <div className="person-roster-heading"><h3>Pacientes con citas</h3><span>{roster.patients} pacientes · {timezone}</span></div>{!roster.total && <p className="overview-empty">No hay citas para este día.</p>}<div className="person-card-list">{roster.patientGroups.map(({ patient, appointments }) => {
        const professionals = new Map(appointments.map(item => [item.professional.id, `${item.professional.firstName} ${item.professional.lastName}`.trim()]));
        return card({ kind: 'patient', id: patient.id }, patient.firstName, patient.lastName, 'Con ' + [...professionals.values()].join(' · '), appointments);
      })}</div>
    </section>
  </div>;
}

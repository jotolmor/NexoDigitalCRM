type Patient = {
  firstName: string; lastName: string; age?: number | null;
  dni?: string | null; phone?: string | null; email?: string | null; address?: string | null;
  postalCode?: string | null; city?: string | null; province?: string | null;
};

export function PatientCardSummary({ patient }: { patient: Patient }) {
  const area = [patient.postalCode, patient.city, patient.province].filter(Boolean).join(' · ');
  return <>
    <span className="patient-directory-avatar" aria-hidden="true">{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</span>
    <div className="directory-record-summary patient-directory-summary">
      <h3>{patient.firstName} {patient.lastName}</h3>
      {patient.dni && <span className="patient-directory-dni">DNI: {patient.dni}</span>}
      {patient.age != null && <span className="patient-directory-age">{patient.age} años</span>}
      {(patient.phone || patient.email) && <div className="patient-directory-contact">{patient.phone && <span>{patient.phone}</span>}{patient.email && <span>{patient.email}</span>}</div>}
      <p className="patient-directory-location">{patient.address && <span>{patient.address}</span>}<span>{area || 'Localidad sin indicar'}</span></p>
    </div>
  </>;
}

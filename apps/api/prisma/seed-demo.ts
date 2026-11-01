import { AppointmentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const has = (name: string) => args.includes(name);
const tenantSlug = option('--tenant-slug');

const localities = [
  ['Sevilla', 'Calle Feria'], ['Dos Hermanas', 'Avenida de España'], ['Alcalá de Guadaíra', 'Calle Silos'],
  ['Utrera', 'Calle Álvarez Hazañas'], ['Mairena del Aljarafe', 'Avenida de los Olmos'], ['Écija', 'Calle Miguel de Cervantes'],
  ['Carmona', 'Calle Real'], ['Lebrija', 'Calle Corredera'], ['Morón de la Frontera', 'Calle Nueva'], ['La Rinconada', 'Calle Madrid'],
  ['Los Palacios y Villafranca', 'Avenida de Sevilla'], ['Coria del Río', 'Calle Betis'], ['Tomares', 'Avenida del Aljarafe'],
  ['San Juan de Aznalfarache', 'Calle Real'], ['Camas', 'Calle Santa María de Gracia'], ['Bormujos', 'Avenida del Aljarafe'],
  ['Gines', 'Calle Colón'], ['Osuna', 'Calle San Pedro'], ['Marchena', 'Calle San Sebastián'], ['Arahal', 'Calle Óleo'],
  ['La Algaba', 'Avenida de Andalucía'], ['Espartinas', 'Avenida de Huelva'], ['Castilleja de la Cuesta', 'Calle Real'],
  ['Pilas', 'Calle Pineda'], ['Sanlúcar la Mayor', 'Calle Juan Carlos I'], ['Cazalla de la Sierra', 'Calle Llana'],
  ['Estepa', 'Calle Mesones'], ['Lora del Río', 'Avenida de Portugal'], ['Brenes', 'Calle Real'], ['Gelves', 'Calle Uruguay'],
  ['La Puebla del Río', 'Calle Comercio'], ['El Viso del Alcor', 'Avenida República de Nicaragua'],
  ['Las Cabezas de San Juan', 'Calle Ancha'], ['Constantina', 'Calle Mesones'], ['Villanueva del Río y Minas', 'Calle Cervantes'],
  ['Cantillana', 'Calle Real'], ['Puebla de Cazalla', 'Calle Morón'], ['El Cuervo de Sevilla', 'Avenida de Jerez'],
  ['Tocina', 'Calle Virgen de Fátima'], ['Guillena', 'Avenida Andalucía'], ['Olivares', 'Calle Cartuja'],
  ['La Campana', 'Calle Larga'], ['Aznalcázar', 'Calle Sevilla'], ['Almensilla', 'Avenida de la Constitución'],
  ['Palomares del Río', 'Calle Isla'], ['Villanueva del Ariscal', 'Calle Rey Juan Carlos I'], ['Aguadulce', 'Calle Sevilla'],
  ['El Saucejo', 'Calle Fray Antonio'], ['El Ronquillo', 'Avenida de Andalucía'], ['Gerena', 'Calle Huerta'],
];
const people: [string, string][] = [
  ['Lucía', 'Romero'], ['Hugo', 'Benítez'], ['Carmen', 'Valdés'], ['Mateo', 'Carmona'], ['Alba', 'Serrano'], ['Daniel', 'Ponce'],
  ['Inés', 'Márquez'], ['Pablo', 'Cárdenas'], ['Claudia', 'Reina'], ['Adrián', 'Molina'], ['Noa', 'Gallego'], ['Mario', 'Castaño'],
  ['Elena', 'Fuentes'], ['Martín', 'Vega'], ['Vera', 'Campos'], ['Leo', 'Naranjo'], ['Irene', 'Lora'], ['Samuel', 'Crespo'],
  ['Aitana', 'Delgado'], ['Bruno', 'Ojeda'], ['Marta', 'Paredes'], ['Gael', 'Prieto'], ['Nerea', 'Montes'], ['Álvaro', 'Cobo'],
  ['Lola', 'Ríos'], ['Diego', 'Barrera'], ['Candela', 'Soto'], ['Manuel', 'Aranda'], ['Marina', 'Linares'], ['Nicolás', 'Acosta'],
  ['Rocío', 'Cabrera'], ['Jaime', 'León'], ['Sara', 'Blanco'], ['Gabriel', 'Mora'], ['Alicia', 'Calvo'], ['Álex', 'Carrasco'],
  ['Eva', 'Pinto'], ['Dario', 'Méndez'], ['Julia', 'Calle'], ['Iván', 'Paz'], ['Sofía', 'Bustos'], ['Eric', 'Carmelo'],
  ['Triana', 'Cano'], ['Marcos', 'Vidal'], ['Ana', 'Roldán'], ['Joel', 'Escobar'], ['Violeta', 'Cortés'], ['Rafael', 'Sáenz'],
  ['Lidia', 'Santos'], ['Pol', 'Moreno'],
];
const doctors = [
  { firstName: 'Clara', lastName: 'Montoro', specialty: 'Odontología general', weekdays: [[1, 0], [2, 1], [3, 0], [4, 1], [5, 0]], services: [0, 1, 2, 3, 6, 11] },
  { firstName: 'Javier', lastName: 'Roldán', specialty: 'Ortodoncia', weekdays: [[1, 1], [2, 0], [3, 1], [4, 0]], services: [0, 1, 4] },
  { firstName: 'Marta', lastName: 'Sánchez', specialty: 'Endodoncia', weekdays: [[1, 0], [2, 0], [3, 1], [4, 0], [5, 1]], services: [0, 2, 5, 11] },
  { firstName: 'Andrés', lastName: 'Carmona', specialty: 'Periodoncia', weekdays: [[1, 1], [2, 0], [3, 1], [5, 0]], services: [0, 1, 8, 9] },
  { firstName: 'Elena', lastName: 'Pineda', specialty: 'Odontopediatría', weekdays: [[1, 0], [2, 1], [3, 0], [5, 0]], services: [0, 1, 7] },
  { firstName: 'Pablo', lastName: 'Benjumea', specialty: 'Cirugía oral', weekdays: [[1, 1], [2, 0], [4, 1], [5, 0]], services: [0, 6, 5] },
  { firstName: 'Irene', lastName: 'Valdivia', specialty: 'Prótesis dental', weekdays: [[1, 0], [3, 1], [4, 0], [5, 1]], services: [0, 2, 10] },
  { firstName: 'Nuria', lastName: 'Herrera', specialty: 'Higiene bucodental', weekdays: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], services: [1, 9] },
];
const services = [
  { name: 'Revisión odontológica', description: 'Exploración y valoración general', durationMinutes: 30, priceEuros: 35 },
  { name: 'Limpieza dental', description: 'Higiene bucodental y eliminación de sarro', durationMinutes: 60, priceEuros: 55 },
  { name: 'Empaste de composite', description: 'Obturación dental conservadora', durationMinutes: 60, priceEuros: 85 },
  { name: 'Blanqueamiento dental', description: 'Tratamiento estético dental', durationMinutes: 60, priceEuros: 190 },
  { name: 'Revisión de ortodoncia', description: 'Control y ajuste del tratamiento', durationMinutes: 30, priceEuros: 45 },
  { name: 'Endodoncia', description: 'Tratamiento de conductos', durationMinutes: 60, priceEuros: 210 },
  { name: 'Extracción simple', description: 'Extracción con valoración previa', durationMinutes: 30, priceEuros: 95 },
  { name: 'Revisión odontopediátrica', description: 'Revisión dental infantil', durationMinutes: 30, priceEuros: 40 },
  { name: 'Valoración periodontal', description: 'Evaluación de encías y soporte dental', durationMinutes: 30, priceEuros: 65 },
  { name: 'Mantenimiento periodontal', description: 'Higiene periodontal especializada', durationMinutes: 60, priceEuros: 80 },
  { name: 'Ajuste de prótesis', description: 'Revisión y ajuste protésico', durationMinutes: 30, priceEuros: 70 },
  { name: 'Control breve', description: 'Control corto de evolución', durationMinutes: 15, priceEuros: 25 },
];
const rooms = ['Gabinete 1', 'Gabinete 2', 'Gabinete 3', 'Gabinete de higiene'];
const timezone = 'Europe/Madrid';

function dateKey(date: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function madridOffset(date: string) {
  const label = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(new Date(`${date}T12:00:00Z`)).find(part => part.type === 'timeZoneName')?.value ?? 'GMT+1';
  const match = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return match ? `${match[1]}${String(match[2]).padStart(2, '0')}:${match[3] ?? '00'}` : '+01:00';
}
function madridDate(date: string, minute: number) {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0'); const mm = String(minute % 60).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00${madridOffset(date)}`);
}
function shuffle<T>(items: T[], random: () => number) { return [...items].sort(() => random() - 0.5); }

async function main() {
  if (!tenantSlug || !has('--replace')) throw new Error('Uso requerido: npm run seed:demo -w @nexoclinic/api -- --tenant-slug <slug> --replace');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no está configurada; no se ha modificado ninguna base de datos.');
  const host = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', 'postgres'].includes(host) && !has('--allow-remote')) throw new Error('La base parece remota. Añade --allow-remote solo si verificaste que es el entorno deseado.');
  if (!has('--confirm-slug') || option('--confirm-slug') !== tenantSlug) throw new Error('Confirma el tenant repitiendo exactamente el slug con --confirm-slug.');

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, include: { clinics: true } });
  if (!tenant || tenant.clinics.length !== 1) throw new Error('No encontré exactamente una clínica para ese tenant slug.');
  const tenantId = tenant.id;
  const clinic = tenant.clinics[0];
  let seed = 20261101;
  for (const char of tenantSlug) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const now = new Date(); const today = dateKey(now); const todayDate = new Date(`${today}T12:00:00Z`);
  const startRange = new Date(todayDate); startRange.setUTCDate(startRange.getUTCDate() - 35);
  const endRange = new Date(todayDate); endRange.setUTCDate(endRange.getUTCDate() + 45);
  const quarterMonth = Math.floor(todayDate.getUTCMonth() / 3) * 3;
  const currentQuarterStart = new Date(Date.UTC(todayDate.getUTCFullYear(), quarterMonth, 1));
  const scheduleStart = new Date(currentQuarterStart); scheduleStart.setUTCMonth(scheduleStart.getUTCMonth() - 3);
  const scheduleEnd = new Date(currentQuarterStart); scheduleEnd.setUTCMonth(scheduleEnd.getUTCMonth() + 15);

  const professionalIds = (await prisma.professional.findMany({ where: { clinicId: clinic.id }, select: { id: true } })).map(item => item.id);
  const serviceIds = (await prisma.service.findMany({ where: { clinicId: clinic.id }, select: { id: true } })).map(item => item.id);

  await prisma.$transaction(async tx => {
    await tx.notification.deleteMany({ where: { clinicId: clinic.id } });
    await tx.notificationTemplate.deleteMany({ where: { clinicId: clinic.id } });
    await tx.automationEvent.deleteMany({ where: { clinicId: clinic.id } });
    await tx.waitlistEntry.deleteMany({ where: { clinicId: clinic.id } });
    await tx.consent.deleteMany({ where: { clinicId: clinic.id } });
    await tx.document.deleteMany({ where: { clinicId: clinic.id } });
    await tx.followUp.deleteMany({ where: { clinicId: clinic.id } });
    await tx.appointment.deleteMany({ where: { clinicId: clinic.id } });
    await tx.timeOff.deleteMany({ where: { clinicId: clinic.id } });
    await tx.scheduleRule.deleteMany({ where: { clinicId: clinic.id } });
    if (professionalIds.length && serviceIds.length) await tx.professionalService.deleteMany({ where: { professionalId: { in: professionalIds }, serviceId: { in: serviceIds } } });
    await tx.patient.deleteMany({ where: { clinicId: clinic.id, tenantId: tenant.id } });
    await tx.room.deleteMany({ where: { clinicId: clinic.id, tenantId: tenant.id } });
    await tx.professional.deleteMany({ where: { clinicId: clinic.id, tenantId: tenant.id } });
    await tx.service.deleteMany({ where: { clinicId: clinic.id, tenantId: tenant.id } });

    await tx.room.createMany({ data: rooms.map(name => ({ tenantId: tenant.id, clinicId: clinic.id, name })) });
    await tx.service.createMany({ data: services.map(service => ({ ...service, tenantId: tenant.id, clinicId: clinic.id })) });
    const createdServices = await tx.service.findMany({ where: { clinicId: clinic.id, tenantId: tenant.id }, orderBy: { name: 'asc' } });
    const serviceByName = new Map(createdServices.map(service => [service.name, service]));
    const createdPros = await Promise.all(doctors.map((doctor, i) => tx.professional.create({ data: { tenantId: tenant.id, clinicId: clinic.id, firstName: doctor.firstName, lastName: doctor.lastName, specialty: doctor.specialty, email: `profesional.${String(i + 1).padStart(2, '0')}@demo.example.invalid`, phone: `+34 000 001 ${String(i + 1).padStart(3, '0')}` } })));
    const proById = new Map(createdPros.map((pro, i) => [pro.id, { ...pro, ...doctors[i] }]));
    const assignmentRows = createdPros.flatMap((pro, i) => doctors[i].services.map(serviceIndex => ({ professionalId: pro.id, serviceId: createdServices.find(service => service.name === services[serviceIndex].name)!.id })));
    await tx.professionalService.createMany({ data: assignmentRows });

    const periods: { from: Date; to: Date }[] = [];
    for (let cursor = new Date(scheduleStart); cursor < scheduleEnd; cursor.setUTCMonth(cursor.getUTCMonth() + 3)) {
      const from = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
      const to = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 0));
      periods.push({ from, to });
    }
    const ruleRows = createdPros.flatMap((pro, i) => periods.flatMap(period => doctors[i].weekdays.map(([weekday, shift]) => ({
      tenantId: tenant.id, clinicId: clinic.id, professionalId: pro.id, weekday,
      startsAtMinute: shift === 0 ? 540 : 960, endsAtMinute: shift === 0 ? 780 : 1200,
      validFrom: period.from, validTo: period.to,
    }))));
    await tx.scheduleRule.createMany({ data: ruleRows });

    const patients = await Promise.all(people.map(([firstName, lastName], i) => {
      const [city] = localities[i];
      const number = String(i + 1).padStart(3, '0');
      return tx.patient.create({ data: { tenantId: tenant.id, clinicId: clinic.id, firstName, lastName, email: `paciente.${number}@demo.example.invalid`, phone: `+34 000 000 ${number}`, city, address: `Calle de Muestra, ${10 + (i % 70)}` } });
    }));
    const roomRecords = await tx.room.findMany({ where: { clinicId: clinic.id, tenantId: tenant.id }, orderBy: { name: 'asc' } });
    const used: Record<string, [number, number][]> = {};
    const appointments: { tenantId: string; clinicId: string; patientId: string; professionalId: string; serviceId: string; roomId: string; startsAt: Date; endsAt: Date; status: AppointmentStatus }[] = [];
    const candidateDates: string[] = [];
    for (let d = new Date(startRange); d <= endRange; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = new Date(d); const key = dateKey(day); const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
      if (weekday >= 1 && weekday <= 5) candidateDates.push(key);
    }
    function selectAppointment(patientIndex: number, historical: boolean) {
      const allowedDates = candidateDates.filter(date => historical ? date < today : date > today);
      for (const date of shuffle(allowedDates, random)) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        for (const proIndex of shuffle(doctors.map((_, i) => i), random)) {
          const pro = createdPros[proIndex]; const doctor = doctors[proIndex];
          const shift = doctor.weekdays.find(([day]) => day === weekday)?.[1];
          if (shift === undefined) continue;
          const serviceIndex = doctor.services[Math.floor(random() * doctor.services.length)];
          const service = serviceByName.get(services[serviceIndex].name)!;
          const duration = service.durationMinutes;
          const base = shift === 0 ? 540 : 960; const starts: number[] = [];
          for (let minute = base; minute + duration <= base + 240; minute += 15) starts.push(minute);
          for (const minute of shuffle(starts, random)) {
            const startsAt = madridDate(date, minute); const endsAt = madridDate(date, minute + duration);
            if (historical ? endsAt >= now : startsAt <= now) continue;
            const key = `${pro.id}:${date}`;
            if ((used[key] ?? []).some(([a, b]) => minute < b && minute + duration > a)) continue;
            used[key] ??= []; used[key].push([minute, minute + duration]);
            const isPast = historical;
            const status: AppointmentStatus = isPast ? (random() < 0.88 ? 'COMPLETED' : random() < 0.5 ? 'NO_SHOW' : 'CANCELLED') : (random() < 0.32 ? 'CONFIRMED' : 'SCHEDULED');
            appointments.push({ tenantId, clinicId: clinic.id, patientId: patients[patientIndex].id, professionalId: pro.id, serviceId: service.id, roomId: roomRecords[Math.floor(random() * roomRecords.length)].id, startsAt, endsAt, status });
            return true;
          }
        }
      }
      return false;
    }
    for (let i = 0; i < patients.length; i++) {
      if (!selectAppointment(i, false)) throw new Error(`No se encontró un turno futuro libre para el paciente ${i + 1}; se cancela la transacción.`);
    }
    for (let i = 0; i < 15; i++) {
      if (!selectAppointment(i, true)) throw new Error(`No se encontró un turno histórico para la cita de muestra ${i + 1}; se cancela la transacción.`);
    }
    const createdAppointments = await Promise.all(appointments.map(appointment => tx.appointment.create({ data: appointment })));
    const futureAppointments = createdAppointments.filter(appointment => appointment.startsAt > now);
    await tx.followUp.createMany({ data: futureAppointments.slice(0, 12).map((appointment, i) => ({ tenantId: tenant.id, clinicId: clinic.id, patientId: appointment.patientId, appointmentId: appointment.id, title: ['Confirmar asistencia', 'Enviar indicaciones previas', 'Revisar evolución'][i % 3], notes: 'Registro ficticio para demostración del CRM.', dueAt: new Date(appointment.startsAt.getTime() - 86400000), status: i % 4 === 0 ? 'COMPLETED' : 'PENDING' })) });
  }, { timeout: 30000 });

  console.log(`Datos demo creados para la clínica ${clinic.name} (${tenantSlug}): ${people.length} pacientes, ${doctors.length} profesionales y 65 citas.`);
  console.log('Correos y teléfonos usan dominios/números de prueba no contactables.');
  console.log(`Turnos y citas usan la zona horaria ${timezone}.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { clinicToday, patientAgeOnDate } from './patient-demographics';
type PatientInput = {
  firstName: string; lastName: string; dni?: string | null; email?: string; phone?: string;
  address?: string; city?: string; postalCode?: string | null;
  province?: string | null; age?: number | null; dateOfBirth?: string | null;
};
@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}
  async list(user: SessionUser, search?: string, filters: { name?: string; dni?: string; phone?: string } = {}) {
    const clinicId = requireClinic(user); const needle = search?.trim();
    const nameParts = filters.name?.trim().split(/\s+/).filter(Boolean) ?? [];
    const document = filters.dni?.replace(/[\s.-]/g, '').toUpperCase();
    const phone = filters.phone?.replace(/\D/g, '');
    if (filters.dni?.trim() && (!document || !/^[A-Z0-9]{1,20}$/.test(document))) throw new BadRequestException('Revisa el DNI de búsqueda.');
    if (filters.phone?.trim() && !phone) throw new BadRequestException('Introduce un teléfono con dígitos.');
    const records = await this.prisma.patient.findMany({ where: { tenantId: user.tenantId, clinicId, ...(nameParts.length ? { AND: nameParts.map(part => ({ OR: [{ firstName: { contains: part, mode: 'insensitive' as const } }, { lastName: { contains: part, mode: 'insensitive' as const } }] })) } : {}), ...(document ? { dni: { contains: document, mode: 'insensitive' as const } } : {}), ...(needle ? { OR: [{ firstName: { contains: needle, mode: 'insensitive' } }, { lastName: { contains: needle, mode: 'insensitive' } }, { email: { contains: needle, mode: 'insensitive' } }] } : {}) }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    // Existing phone numbers can include spaces, prefixes, hyphens or parentheses.
    const patients = phone ? records.filter(patient => patient.phone?.replace(/\D/g, '').includes(phone)) : records;
    if (!patients.some(patient => patient.dateOfBirth)) return patients;
    const today = clinicToday(await this.timezone(user));
    return patients.map(patient => patient.dateOfBirth ? { ...patient, age: patientAgeOnDate(patient.dateOfBirth, today) } : patient);
  }
  async create(user: SessionUser, input: PatientInput) {
    const clinicId = requireWriter(user);
    const data = await this.normalizeInput(user, input);
    return this.prisma.patient.create({ data: { tenantId: user.tenantId, clinicId, ...data } });
  }
  async update(user: SessionUser, id: string, input: PatientInput) {
    const clinicId = requireWriter(user);
    const data = await this.normalizeInput(user, input);
    const result = await this.prisma.patient.updateMany({ where: { id, tenantId: user.tenantId, clinicId }, data });
    if (!result.count) throw new NotFoundException('Paciente no encontrado');
    const patient = await this.prisma.patient.findFirstOrThrow({ where: { id, tenantId: user.tenantId, clinicId } });
    return patient.dateOfBirth ? { ...patient, age: patientAgeOnDate(patient.dateOfBirth, clinicToday(await this.timezone(user))) } : patient;
  }
  private async timezone(user: SessionUser) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: requireClinic(user), tenantId: user.tenantId }, select: { timezone: true } });
    return clinic?.timezone ?? 'Europe/Madrid';
  }
  private async normalizeInput(user: SessionUser, input: PatientInput) {
    const { dateOfBirth, dni, ...rest } = input;
    const normalizedDni = dni == null ? dni : dni.replace(/[\s.-]/g, '').toUpperCase();
    if (dni != null && (!normalizedDni || !/^[A-Z0-9]{3,20}$/.test(normalizedDni))) throw new BadRequestException('Revisa el DNI: utiliza letras y números, entre 3 y 20 caracteres.');
    const data = { ...rest, ...(dni !== undefined ? { dni: normalizedDni } : {}) };
    if (dateOfBirth === undefined) return data;
    if (dateOfBirth === null) return { ...data, dateOfBirth: null };
    const age = patientAgeOnDate(dateOfBirth, clinicToday(await this.timezone(user)));
    if (age === null) throw new BadRequestException('Revisa la fecha de nacimiento: no puede ser futura ni corresponder a una edad superior a 130 años.');
    return { ...data, dateOfBirth: new Date(dateOfBirth + 'T00:00:00Z'), age };
  }
}

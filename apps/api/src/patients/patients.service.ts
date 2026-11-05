import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { clinicToday, patientAgeOnDate } from './patient-demographics';
type PatientInput = {
  firstName: string; lastName: string; email?: string; phone?: string;
  address?: string; city?: string; postalCode?: string | null;
  province?: string | null; age?: number | null; dateOfBirth?: string | null;
};
@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}
  async list(user: SessionUser, search?: string) {
    const clinicId = requireClinic(user); const needle = search?.trim();
    const patients = await this.prisma.patient.findMany({ where: { tenantId: user.tenantId, clinicId, ...(needle ? { OR: [{ firstName: { contains: needle, mode: 'insensitive' } }, { lastName: { contains: needle, mode: 'insensitive' } }, { email: { contains: needle, mode: 'insensitive' } }] } : {}) }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
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
    const { dateOfBirth, ...data } = input;
    if (dateOfBirth === undefined) return data;
    if (dateOfBirth === null) return { ...data, dateOfBirth: null };
    const age = patientAgeOnDate(dateOfBirth, clinicToday(await this.timezone(user)));
    if (age === null) throw new BadRequestException('Revisa la fecha de nacimiento: no puede ser futura ni corresponder a una edad superior a 130 años.');
    return { ...data, dateOfBirth: new Date(dateOfBirth + 'T00:00:00Z'), age };
  }
}

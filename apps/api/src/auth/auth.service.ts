import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  async register(input: { clinicName: string; specialty: string; businessType?: string; name: string; email: string; password: string }) {
    const slug = input.clinicName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (await this.prisma.tenant.findUnique({ where: { slug } })) throw new ConflictException('Ya existe una clínica con ese nombre');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.create({ data: { name: input.clinicName, slug } });
      const businessType = input.businessType ?? 'CLINIC';
      const clinic = await tx.clinic.create({ data: { tenantId: tenant.id, name: input.clinicName, specialty: input.specialty, businessType, terminology: this.terminologyFor(businessType) } });
      const user = await tx.user.create({ data: { tenantId: tenant.id, clinicId: clinic.id, name: input.name, email: input.email.toLowerCase(), passwordHash, role: 'CLINIC_OWNER' } });
      return { tenant, clinic, user };
    });
    return this.session(created.user);
  }
  private terminologyFor(businessType: string) {
    const labels: Record<string, { customer: string; customers: string; professional: string; professionals: string; appointment: string; appointments: string; service: string; services: string }> = {
      CLINIC: { customer: 'paciente', customers: 'pacientes', professional: 'profesional', professionals: 'profesionales', appointment: 'cita', appointments: 'citas', service: 'servicio', services: 'servicios' },
      BEAUTY: { customer: 'cliente', customers: 'clientes', professional: 'especialista', professionals: 'especialistas', appointment: 'reserva', appointments: 'reservas', service: 'tratamiento', services: 'tratamientos' },
      FITNESS: { customer: 'cliente', customers: 'clientes', professional: 'entrenador', professionals: 'entrenadores', appointment: 'sesión', appointments: 'sesiones', service: 'actividad', services: 'actividades' },
      EDUCATION: { customer: 'alumno', customers: 'alumnos', professional: 'docente', professionals: 'docentes', appointment: 'clase', appointments: 'clases', service: 'curso', services: 'cursos' },
      PROFESSIONAL_SERVICES: { customer: 'cliente', customers: 'clientes', professional: 'asesor', professionals: 'asesores', appointment: 'reunión', appointments: 'reuniones', service: 'servicio', services: 'servicios' },
      HOME_SERVICES: { customer: 'cliente', customers: 'clientes', professional: 'técnico', professionals: 'técnicos', appointment: 'visita', appointments: 'visitas', service: 'servicio', services: 'servicios' },
      AUTOMOTIVE: { customer: 'cliente', customers: 'clientes', professional: 'técnico', professionals: 'técnicos', appointment: 'reserva', appointments: 'reservas', service: 'reparación', services: 'reparaciones' },
      OTHER: { customer: 'cliente', customers: 'clientes', professional: 'miembro', professionals: 'miembros', appointment: 'reserva', appointments: 'reservas', service: 'servicio', services: 'servicios' }
    };
    return labels[businessType] ?? labels.OTHER;
  }
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Credenciales inválidas');
    return this.session(user);
  }
  async createMember(tenantId: string, clinicId: string, input: { name: string; email: string; password: string; role: UserRole }) {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('El correo ya está en uso');
    return this.prisma.user.create({ data: { tenantId, clinicId, name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), role: input.role }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  }
  private session(user: { id: string; tenantId: string; clinicId: string | null; email: string; name: string; role: string }) {
    const payload = { sub: user.id, tenantId: user.tenantId, clinicId: user.clinicId, role: user.role };
    return { accessToken: this.jwt.sign(payload), user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, clinicId: user.clinicId, role: user.role } };
  }
}

import { ForbiddenException } from '@nestjs/common';

export type SessionUser = { sub?: string; tenantId: string; clinicId: string | null; role: string };
const writers = new Set(['CLINIC_OWNER', 'DIRECTOR', 'RECEPTIONIST', 'ADMINISTRATIVE']);
export function requireClinic(user: SessionUser) {
  if (!user.clinicId) throw new ForbiddenException('No hay clínica asignada');
  return user.clinicId;
}
export function requireWriter(user: SessionUser) {
  if (!writers.has(user.role)) throw new ForbiddenException('No tienes permiso para modificar esta información');
  return requireClinic(user);
}
export function requireOwner(user: SessionUser) {
  if (user.role !== 'CLINIC_OWNER') throw new ForbiddenException('Solo el propietario puede gestionar miembros');
  return requireClinic(user);
}

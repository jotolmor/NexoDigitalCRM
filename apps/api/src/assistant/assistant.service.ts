import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClaudeGateway, REFUSAL_ANSWER, answerText, safeHistory, toolUses } from '../ai/claude.gateway';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { PrismaService } from '../prisma.service';

type PendingAppointmentAction =
  | { kind: 'create'; patientId: string; professionalId: string; serviceId: string; startsAt: string; endsAt: string; summary: string }
  | { kind: 'reschedule'; appointmentId: string; professionalId: string; serviceId: string; startsAt: string; endsAt: string; summary: string }
  | { kind: 'cancel'; appointmentId: string; summary: string };

const SYSTEM_PROMPT = 'Eres el asistente de agenda de NexoFlow CRM para clínicas dentales en España. Tienes herramientas conectadas a los datos reales de la clínica autenticada. El último mensaje del usuario incluye la fecha y la hora actuales en la zona horaria de la clínica; úsalas para interpretar «hoy», «mañana» o «esta semana». Responde en español. Para buscar citas, pacientes, profesionales, tratamientos y disponibilidad usa las herramientas; nunca inventes registros ni huecos. Si falta un dato, pregunta. Para reservar, cambiar o cancelar una cita prepara una acción y explica al usuario todos sus datos; la acción requiere que pulse el botón de confirmación que aparecerá en la aplicación. Nunca digas que una acción se completó antes de recibir confirmación. No intentes contactar al paciente ni enviar mensajes externos.';
const FALLBACK_ANSWER = 'He consultado la agenda. Dime qué opción prefieres o concreta los datos que faltan.';

const tools: Anthropic.Beta.BetaTool[] = [
  { name: 'search_clinic', strict: true, description: 'Consulta los registros reales de pacientes, profesionales, tratamientos o citas de esta clínica. Usa nombres exactos cuando haya homónimos.', input_schema: { type: 'object', properties: { category: { type: 'string', enum: ['patients', 'professionals', 'services', 'appointments'] }, search: { type: 'string', description: 'Nombre o término de búsqueda' } }, required: ['category'], additionalProperties: false } },
  { name: 'find_open_slots', strict: true, description: 'Busca disponibilidad real de un profesional para un tratamiento. Devuelve opciones para los próximos 45 días.', input_schema: { type: 'object', properties: { professionalId: { type: 'string' }, serviceId: { type: 'string' } }, required: ['professionalId', 'serviceId'], additionalProperties: false } },
  { name: 'prepare_booking', strict: true, description: 'Prepara una nueva reserva para confirmar en la interfaz. Llama solo cuando se conozcan paciente, profesional, tratamiento y hora exacta que está dentro de las opciones disponibles.', input_schema: { type: 'object', properties: { patientId: { type: 'string' }, professionalId: { type: 'string' }, serviceId: { type: 'string' }, startsAt: { type: 'string', description: 'Fecha y hora ISO exacta devuelta por find_open_slots' } }, required: ['patientId', 'professionalId', 'serviceId', 'startsAt'], additionalProperties: false } },
  { name: 'prepare_reschedule', strict: true, description: 'Prepara el cambio de fecha/hora de una cita existente. No realiza el cambio hasta que el usuario pulse Confirmar.', input_schema: { type: 'object', properties: { appointmentId: { type: 'string' }, startsAt: { type: 'string', description: 'Fecha y hora ISO solicitada' } }, required: ['appointmentId', 'startsAt'], additionalProperties: false } },
  { name: 'prepare_cancellation', strict: true, description: 'Prepara la cancelación de una cita existente. No cancela hasta que el usuario pulse Confirmar.', input_schema: { type: 'object', properties: { appointmentId: { type: 'string' } }, required: ['appointmentId'], additionalProperties: false } }
];

@Injectable()
export class AssistantService {
  constructor(private prisma: PrismaService, private appointments: AppointmentsService, private claude: ClaudeGateway) {}

  async ask(user: SessionUser, question: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
    if (!this.claude.isConfigured()) throw new ServiceUnavailableException('El asistente aún no está conectado. Configura ANTHROPIC_API_KEY en el servidor.');
    const clinicId = requireClinic(user);
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });
    const timezone = clinic?.timezone ?? 'Europe/Madrid';
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const weekday = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, weekday: 'long' }).format(now);
    const time = new Intl.DateTimeFormat('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const context = `Contexto actual: hoy es ${weekday} ${today}, son las ${time} en la zona ${timezone}.`;
    const messages: Anthropic.Beta.BetaMessageParam[] = [...safeHistory(history, 10, 1200), { role: 'user', content: [{ type: 'text', text: question }, { type: 'text', text: context }] }];
    let pendingAction: PendingAppointmentAction | null = null;
    for (let turn = 0; turn < 4; turn++) {
      const response = await this.claude.create({ system: SYSTEM_PROMPT, messages, tools });
      if (response.stop_reason === 'refusal') return { answer: REFUSAL_ANSWER, pendingAction: null };
      if (response.stop_reason !== 'tool_use') {
        const answer = answerText(response);
        if (answer) return { answer, pendingAction };
        if (response.stop_reason === 'max_tokens') return { answer: FALLBACK_ANSWER, pendingAction };
        throw new BadGatewayException('La IA devolvió una respuesta vacía.');
      }
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of toolUses(response)) {
        try {
          const execution = await this.executeTool(user, call.name, call.input ?? {}, Boolean(pendingAction));
          if (execution.action) pendingAction = execution.action;
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(execution?.result ?? execution) });
        } catch (error) {
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: JSON.stringify({ error: error instanceof Error ? error.message : 'No se pudo consultar la agenda.' }) });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return { answer: FALLBACK_ANSWER, pendingAction };
  }

  async confirm(user: SessionUser, raw: unknown) {
    requireWriter(user);
    if (!raw || typeof raw !== 'object' || !('kind' in raw)) throw new ConflictException('La acción pendiente no es válida.');
    const action = raw as PendingAppointmentAction;
    if (action.kind === 'create') {
      const result = await this.appointments.create(user, action);
      return { message: `Cita reservada para ${action.summary}.`, appointment: result };
    }
    if (action.kind === 'reschedule') {
      const result = await this.appointments.reschedule(user, action.appointmentId, action);
      return { message: `Cita cambiada correctamente: ${action.summary}.`, appointment: result };
    }
    if (action.kind === 'cancel') {
      const clinicId = requireClinic(user);
      const current = await this.prisma.appointment.findFirst({ where: { id: action.appointmentId, tenantId: user.tenantId, clinicId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gte: new Date() } } });
      if (!current) throw new ConflictException('La cita ya no está pendiente o ya pasó. Actualiza la agenda antes de continuar.');
      const result = await this.appointments.updateStatus(user, action.appointmentId, AppointmentStatus.CANCELLED);
      return { message: `Cita cancelada: ${action.summary}.`, appointment: result };
    }
    throw new ConflictException('La acción pendiente no es válida.');
  }

  private async executeTool(user: SessionUser, name: string, args: any, hasPending: boolean): Promise<any> {
    const clinicId = requireClinic(user);
    if (name === 'search_clinic') {
      const search = String(args.search ?? '').trim();
      if (args.category === 'patients') return this.prisma.patient.findMany({ where: { tenantId: user.tenantId, clinicId, ...(search ? { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } : {}) }, select: { id: true, firstName: true, lastName: true, email: true }, take: 20 });
      if (args.category === 'professionals') return this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId, active: true, ...(search ? { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { specialty: { contains: search, mode: 'insensitive' } }] } : {}) }, select: { id: true, firstName: true, lastName: true, specialty: true }, take: 20 });
      if (args.category === 'services') return this.prisma.service.findMany({ where: { tenantId: user.tenantId, clinicId, active: true, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) }, select: { id: true, name: true, durationMinutes: true, priceEuros: true }, take: 20 });
      if (args.category === 'appointments') return this.prisma.appointment.findMany({ where: { tenantId: user.tenantId, clinicId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gte: new Date() }, ...(search ? { patient: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } } : {}) }, include: { patient: { select: { firstName: true, lastName: true } }, professional: { select: { firstName: true, lastName: true } }, service: { select: { name: true, durationMinutes: true } } }, orderBy: { startsAt: 'asc' }, take: 30 });
    }
    if (name === 'find_open_slots') return this.appointments.availability(user, String(args.professionalId), String(args.serviceId));
    if (['prepare_booking', 'prepare_reschedule', 'prepare_cancellation'].includes(name)) {
      if (hasPending) return { error: 'Ya hay una acción pendiente de confirmar.' };
      if (name === 'prepare_booking') {
        const [patient, professional, service] = await Promise.all([
          this.prisma.patient.findFirst({ where: { id: String(args.patientId), tenantId: user.tenantId, clinicId }, select: { id: true, firstName: true, lastName: true } }),
          this.prisma.professional.findFirst({ where: { id: String(args.professionalId), tenantId: user.tenantId, clinicId, active: true }, select: { id: true, firstName: true, lastName: true } }),
          this.prisma.service.findFirst({ where: { id: String(args.serviceId), tenantId: user.tenantId, clinicId, active: true }, select: { id: true, name: true, durationMinutes: true } })
        ]);
        if (!patient || !professional || !service) return { error: 'No he encontrado al paciente, profesional o tratamiento dentro de esta clínica.' };
        const availability = await this.appointments.availability(user, professional.id, service.id);
        const slot = availability.slots.find(item => new Date(item.startsAt).getTime() === new Date(String(args.startsAt)).getTime());
        if (!slot) return { error: 'La hora solicitada no coincide con un hueco libre. Ofrece al usuario las opciones devueltas por disponibilidad.' , options: availability.slots.slice(0, 8) };
        const summary = `${patient.firstName} ${patient.lastName}, ${service.name} con ${professional.firstName} ${professional.lastName}, ${slot.localStart} (${availability.timezone})`;
        return { result: { prepared: true, summary, startsAt: slot.startsAt }, action: { kind: 'create', patientId: patient.id, professionalId: professional.id, serviceId: service.id, startsAt: slot.startsAt, endsAt: slot.endsAt, summary } };
      }
      const appointment = await this.prisma.appointment.findFirst({ where: { id: String(args.appointmentId), tenantId: user.tenantId, clinicId, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, include: { patient: true, professional: true, service: true } });
      if (!appointment) return { error: 'No he encontrado una cita futura activa con ese identificador.' };
      const base = `${appointment.patient.firstName} ${appointment.patient.lastName}, ${appointment.service?.name ?? 'cita'} con ${appointment.professional.firstName} ${appointment.professional.lastName}`;
      if (name === 'prepare_cancellation') return { result: { prepared: true, summary: base + ` · ${appointment.startsAt.toLocaleString('es-ES')}` }, action: { kind: 'cancel', appointmentId: appointment.id, summary: base + ` · ${appointment.startsAt.toLocaleString('es-ES')}` } };
      if (!appointment.serviceId || !appointment.service) return { error: 'Esta cita no tiene tratamiento asignado y no puedo calcular su duración para moverla.' };
      const startsAt = new Date(String(args.startsAt));
      if (!Number.isFinite(startsAt.getTime())) return { error: 'La fecha propuesta no es válida.' };
      const availability = await this.appointments.availability(user, appointment.professionalId, appointment.serviceId, appointment.id);
      const slot = availability.slots.find(item => new Date(item.startsAt).getTime() === startsAt.getTime());
      if (!slot) return { error: 'La nueva hora no está libre o queda fuera del horario. Propón una hora de las opciones libres.', options: availability.slots.slice(0, 8) };
      const endsAt = new Date(slot.endsAt);
      const summary = `${base} al ${startsAt.toLocaleString('es-ES')}`;
      return { result: { prepared: true, summary, startsAt: startsAt.toISOString() }, action: { kind: 'reschedule', appointmentId: appointment.id, professionalId: appointment.professionalId, serviceId: appointment.serviceId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), summary } };
    }
    return { result: { error: 'Herramienta no reconocida.' } };
  }
}

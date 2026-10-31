import { BadGatewayException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { PrismaService } from '../prisma.service';

type PendingAppointmentAction =
  | { kind: 'create'; patientId: string; professionalId: string; serviceId: string; startsAt: string; endsAt: string; summary: string }
  | { kind: 'reschedule'; appointmentId: string; professionalId: string; serviceId: string; startsAt: string; endsAt: string; summary: string }
  | { kind: 'cancel'; appointmentId: string; summary: string };

const tools = [
  { type: 'function', function: { name: 'search_clinic', description: 'Consulta los registros reales de pacientes, profesionales, tratamientos o citas de esta clínica. Usa nombres exactos cuando haya homónimos.', parameters: { type: 'object', properties: { category: { type: 'string', enum: ['patients', 'professionals', 'services', 'appointments'] }, search: { type: 'string', description: 'Nombre o término de búsqueda' } }, required: ['category'], additionalProperties: false } } },
  { type: 'function', function: { name: 'find_open_slots', description: 'Busca disponibilidad real de un profesional para un tratamiento. Devuelve opciones para los próximos 45 días.', parameters: { type: 'object', properties: { professionalId: { type: 'string' }, serviceId: { type: 'string' } }, required: ['professionalId', 'serviceId'], additionalProperties: false } } },
  { type: 'function', function: { name: 'prepare_booking', description: 'Prepara una nueva reserva para confirmar en la interfaz. Llama solo cuando se conozcan paciente, profesional, tratamiento y hora exacta que está dentro de las opciones disponibles.', parameters: { type: 'object', properties: { patientId: { type: 'string' }, professionalId: { type: 'string' }, serviceId: { type: 'string' }, startsAt: { type: 'string', description: 'Fecha y hora ISO exacta devuelta por find_open_slots' } }, required: ['patientId', 'professionalId', 'serviceId', 'startsAt'], additionalProperties: false } } },
  { type: 'function', function: { name: 'prepare_reschedule', description: 'Prepara el cambio de fecha/hora de una cita existente. No realiza el cambio hasta que el usuario pulse Confirmar.', parameters: { type: 'object', properties: { appointmentId: { type: 'string' }, startsAt: { type: 'string', description: 'Fecha y hora ISO solicitada' } }, required: ['appointmentId', 'startsAt'], additionalProperties: false } } },
  { type: 'function', function: { name: 'prepare_cancellation', description: 'Prepara la cancelación de una cita existente. No cancela hasta que el usuario pulse Confirmar.', parameters: { type: 'object', properties: { appointmentId: { type: 'string' } }, required: ['appointmentId'], additionalProperties: false } } }
];

@Injectable()
export class AssistantService {
  constructor(private prisma: PrismaService, private appointments: AppointmentsService) {}

  async ask(user: SessionUser, question: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('El asistente aún no está conectado. Configura OPENAI_API_KEY en Render.');
    const safeHistory = (Array.isArray(history) ? history : []).filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').slice(-10).map(item => ({ role: item.role, content: item.content.slice(0, 1200) }));
    const messages: any[] = [
      { role: 'system', content: 'Eres el asistente de agenda de NexoFlow CRM para clínicas dentales en España. Tienes herramientas conectadas a los datos reales de la clínica autenticada. Responde en español. Para buscar citas, pacientes, profesionales, tratamientos y disponibilidad usa las herramientas; nunca inventes registros ni huecos. Si falta un dato, pregunta. Para reservar, cambiar o cancelar una cita prepara una acción y explica al usuario todos sus datos; la acción requiere que pulse el botón de confirmación que aparecerá en la aplicación. Nunca digas que una acción se completó antes de recibir confirmación. No intentes contactar al paciente ni enviar mensajes externos.' },
      ...safeHistory,
      { role: 'user', content: question }
    ];
    let pendingAction: PendingAppointmentAction | null = null;
    for (let turn = 0; turn < 4; turn++) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 700 })
      });
      if (!response.ok) {
        if (response.status === 401) throw new ServiceUnavailableException('La clave de OpenAI configurada en Render no es válida.');
        if (response.status === 429) throw new ServiceUnavailableException('OpenAI ha alcanzado su límite o necesita crédito. Revisa el uso y la facturación de la cuenta.');
        throw new BadGatewayException('No se pudo obtener una respuesta de OpenAI. Inténtalo de nuevo.');
      }
      const result = await response.json() as any;
      const message = result.choices?.[0]?.message;
      if (!message) throw new BadGatewayException('OpenAI devolvió una respuesta vacía.');
      if (!message.tool_calls?.length) {
        const answer = String(message.content ?? '').trim();
        if (!answer) throw new BadGatewayException('OpenAI devolvió una respuesta vacía.');
        return { answer, pendingAction };
      }
      messages.push(message);
      for (const call of message.tool_calls) {
        let output: unknown;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          const execution = await this.executeTool(user, call.function.name, args, Boolean(pendingAction));
          output = execution?.result ?? execution;
          if (execution.action) pendingAction = execution.action;
        } catch (error) {
          output = { error: error instanceof Error ? error.message : 'No se pudo consultar la agenda.' };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
      }
    }
    return { answer: 'He consultado la agenda. Dime qué opción prefieres o concreta los datos que faltan.', pendingAction };
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

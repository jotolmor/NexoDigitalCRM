import { BadGatewayException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { SchedulingService } from './scheduling.service';
import { PreparedShift, shiftSnapshot } from './shift-plan';
const fields = { professionalId: { type: 'string' }, weekday: { type: 'integer', description: 'Lunes=1 a viernes=5' }, startsAtMinute: { type: 'integer' }, endsAtMinute: { type: 'integer' }, validFrom: { type: 'string', description: 'YYYY-MM-DD' }, validTo: { type: 'string', description: 'YYYY-MM-DD' } };
const tools = [
  { type: 'function', function: { name: 'list_professionals', description: 'Consulta los profesionales reales de la clínica. Si hay homónimos, pide aclaración.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_shifts', description: 'Consulta todos los turnos activos reales de un profesional.', parameters: { type: 'object', properties: { professionalId: { type: 'string' } }, required: ['professionalId'], additionalProperties: false } } },
  { type: 'function', function: { name: 'prepare_shift_changes', description: 'Prepara de 1 a 20 cambios para revisar y confirmar. No guarda. Para update/remove usa el ruleId obtenido de get_shifts. Un cambio create/update necesita todos los campos de rule.', parameters: { type: 'object', properties: { changes: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { kind: { type: 'string', enum: ['create', 'update', 'remove'] }, ruleId: { type: 'string' }, rule: { type: 'object', properties: fields, required: Object.keys(fields), additionalProperties: false } }, required: ['kind'], additionalProperties: false } } }, required: ['changes'], additionalProperties: false } } }
];
type Proposal = { actor: string; expiresAt: number; changes: PreparedShift[] };
@Injectable()
export class ShiftAssistantService {
  private proposals = new Map<string, Proposal>();
  constructor(private prisma: PrismaService, private scheduling: SchedulingService) {}
  private actor(user: SessionUser) {
    if (!user.sub) throw new ForbiddenException('Vuelve a iniciar sesión para identificar al usuario.');
    return JSON.stringify([user.tenantId, requireClinic(user), user.sub]);
  }
  async ask(user: SessionUser, question: string, history: any[] = [], selectedProfessionalId?: string) {
    const clinicId = requireClinic(user);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('El asistente de turnos necesita OPENAI_API_KEY en el servidor. La gestión manual sigue disponible.');
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });
    const timezone = clinic?.timezone ?? 'Europe/Madrid';
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const messages: any[] = [{ role: 'system', content: `Eres Nexo IA, asistente de turnos de profesionales. Hoy es ${today}, instante ${now.toISOString()}, zona ${timezone}. Los minutos representan horas locales, nunca UTC. Profesional seleccionado: ${selectedProfessionalId || 'ninguno'}; confirma su nombre con herramientas. Responde en español. Usa herramientas para consultar profesionales y turnos, nunca inventes IDs ni asignaciones. Pregunta por datos ambiguos o ausentes, incluidas fechas de vigencia; no deduzcas un profesional homónimo. Solo prepara cambios cuando el usuario lo ordene. Las herramientas no guardan: el usuario debe pulsar Confirmar cambios. No afirmes que guardaste antes de la confirmación. No modifiques citas, pacientes ni datos externos. Respeta turnos de lunes a viernes: inicio por horas 09:00 a 13:00 o 16:00 a 20:00; final cada 15 minutos hasta 14:00 o 21:00; duración máxima 5 horas. Para jornadas con mañana y tarde prepara dos turnos por día. Revisa los turnos actuales antes de proponer modificaciones o retiradas.` },
      ...(Array.isArray(history) ? history : []).filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-24).map(item => ({ role: item.role, content: item.content.slice(0, 2000) })), { role: 'user', content: question }];
    let pendingAction: { proposalId: string; summaries: string[]; expiresAt: string } | null = null;
    for (let turn = 0; turn < 8; turn++) {
      let response: Response;
      try { response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, tools, tool_choice: turn === 7 ? 'none' : 'auto', temperature: 0.2, max_tokens: 1200 }), signal: AbortSignal.timeout(30000) }); }
      catch { throw new BadGatewayException('No se pudo conectar con la IA. Inténtalo de nuevo o utiliza la gestión manual.'); }
      if (!response.ok) {
        if (response.status === 401) throw new ServiceUnavailableException('La clave de OpenAI del servidor no es válida.');
        if (response.status === 429) throw new ServiceUnavailableException('OpenAI ha alcanzado su límite o necesita crédito.');
        throw new BadGatewayException('No se pudo obtener una respuesta de la IA.');
      }
      const result = await response.json() as any;
      const message = result.choices?.[0]?.message;
      if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 20) throw new BadGatewayException('La IA devolvió demasiadas herramientas en una sola respuesta.');
      if (!message) throw new BadGatewayException('La IA devolvió una respuesta vacía.');
      if (!message.tool_calls?.length) return { answer: String(message.content || 'Revisa los turnos consultados y concreta los datos que faltan.'), pendingAction };
      messages.push(message);
      for (const call of message.tool_calls.slice(0, 20)) {
        let output: unknown;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          if (call.function.name === 'list_professionals') output = await this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId, active: true }, select: { id: true, firstName: true, lastName: true, specialty: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
          else if (call.function.name === 'get_shifts') output = (await this.scheduling.rules(user, String(args.professionalId))).map(shiftSnapshot);
          else if (call.function.name === 'prepare_shift_changes') {
            requireWriter(user);
            if (pendingAction) throw new ConflictException('Ya hay una propuesta pendiente.');
            const changes = await this.scheduling.preview(user, args.changes);
            for (const [id, proposal] of this.proposals) if (proposal.expiresAt <= Date.now()) this.proposals.delete(id);
            if (this.proposals.size >= 500) throw new ConflictException('Hay demasiadas propuestas pendientes. Inténtalo en unos minutos.');
            const proposalId = randomUUID(), expiresAt = Date.now() + 10 * 60 * 1000;
            this.proposals.set(proposalId, { actor: this.actor(user), expiresAt, changes });
            pendingAction = { proposalId, summaries: changes.map(change => change.summary), expiresAt: new Date(expiresAt).toISOString() };
            output = { prepared: true, summaries: pendingAction.summaries, requiresConfirmation: true };
          } else output = { error: 'Herramienta desconocida.' };
        } catch (error) { output = { error: error instanceof Error ? error.message : 'No se pudo consultar el turno.' }; }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
      }
    }
    return { answer: 'Revisa la propuesta de turnos o concreta los datos que faltan.', pendingAction };
  }
  async confirm(user: SessionUser, proposalId: string) {
    requireWriter(user);
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.expiresAt <= Date.now()) { this.proposals.delete(proposalId); throw new ConflictException('La propuesta ha caducado o ya fue confirmada. Consulta los turnos y prepara una nueva.'); }
    if (proposal.actor !== this.actor(user)) throw new ForbiddenException('La propuesta pertenece a otro usuario o clínica.');
    // Consume before awaiting the transaction to prevent duplicate confirmations.
    this.proposals.delete(proposalId);
    const rules = await this.scheduling.apply(user, proposal.changes, true);
    return { message: `${rules.length} ${rules.length === 1 ? 'cambio de turno guardado' : 'cambios de turnos guardados'}. Las citas existentes se mantienen.`, rules };
  }
}

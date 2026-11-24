import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClaudeGateway, REFUSAL_ANSWER, answerText, safeHistory, toolUses } from '../ai/claude.gateway';
import { PrismaService } from '../prisma.service';
import { SessionUser, requireClinic, requireWriter } from '../common/access';
import { SchedulingService } from './scheduling.service';
import { requiresColleagueAgreement } from './shift-swap';
import { PreparedShift, shiftSnapshot } from './shift-plan';
const fields = { professionalId: { type: 'string' }, weekday: { type: 'integer', description: 'Lunes=1 a viernes=5' }, startsAtMinute: { type: 'integer' }, endsAtMinute: { type: 'integer' }, validFrom: { type: 'string', description: 'YYYY-MM-DD' }, validTo: { type: 'string', description: 'YYYY-MM-DD' } };
const tools: Anthropic.Beta.BetaTool[] = [
  { name: 'list_professionals', strict: true, description: 'Consulta los profesionales reales de la clínica. Si hay homónimos, pide aclaración.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_shifts', strict: true, description: 'Consulta todos los turnos activos reales de un profesional.', input_schema: { type: 'object', properties: { professionalId: { type: 'string' } }, required: ['professionalId'], additionalProperties: false } },
  { name: 'prepare_shift_swap', strict: true, description: 'Prepara el intercambio completo de dos turnos reales entre profesionales diferentes, aunque sean de días u horas diferentes. Consulta antes los turnos de ambos. No guarda; la interfaz solicita confirmar el acuerdo de los profesionales y después confirmar ambos cambios juntos. No modifica citas de pacientes.', input_schema: { type: 'object', properties: { firstRuleId: { type: 'string' }, secondRuleId: { type: 'string' } }, required: ['firstRuleId', 'secondRuleId'], additionalProperties: false } },
  { name: 'prepare_shift_changes', strict: true, description: 'Comprueba de 1 a 20 cambios y prepara únicamente los que se pueden aplicar. Si ninguno está disponible, devuelve alternativas reales que requieren la elección del usuario. No guarda. Para update/remove usa el ruleId obtenido de get_shifts. Un cambio create/update necesita todos los campos de rule.', input_schema: { type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: ['create', 'update', 'remove'] }, ruleId: { type: 'string' }, rule: { type: 'object', properties: fields, required: Object.keys(fields), additionalProperties: false } }, required: ['kind'], additionalProperties: false } } }, required: ['changes'], additionalProperties: false } }
];
const FALLBACK_ANSWER = 'Revisa los turnos consultados y concreta los datos que faltan.';
type Proposal = { actor: string; expiresAt: number; changes: PreparedShift[]; requiresAgreement: boolean };
@Injectable()
export class ShiftAssistantService {
  private proposals = new Map<string, Proposal>();
  constructor(private prisma: PrismaService, private scheduling: SchedulingService, private claude: ClaudeGateway) {}
  private actor(user: SessionUser) {
    if (!user.sub) throw new ForbiddenException('Vuelve a iniciar sesión para identificar al usuario.');
    return JSON.stringify([user.tenantId, requireClinic(user), user.sub]);
  }
  async ask(user: SessionUser, question: string, history: any[] = [], selectedProfessionalId?: string) {
    const clinicId = requireClinic(user);
    if (!this.claude.isConfigured()) throw new ServiceUnavailableException('El asistente de turnos necesita ANTHROPIC_API_KEY en el servidor. La gestión manual sigue disponible.');
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });
    const timezone = clinic?.timezone ?? 'Europe/Madrid';
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const context = `Contexto actual: hoy es ${today}, instante ${now.toISOString()}, zona ${timezone}. Profesional seleccionado: ${selectedProfessionalId || 'ninguno'}; confirma su nombre con herramientas.`;
    const system = `Eres Nexo IA, asistente de turnos de profesionales. El último mensaje del usuario incluye la fecha, la zona horaria y el profesional seleccionado. Los minutos representan horas locales, nunca UTC. Responde en español. Usa herramientas para consultar profesionales y turnos, nunca inventes IDs ni asignaciones. Pregunta por datos ambiguos o ausentes, incluidas fechas de vigencia; no deduzcas un profesional homónimo. Solo prepara cambios cuando el usuario lo ordene. Las herramientas no guardan: el usuario debe pulsar Confirmar cambios. No afirmes que guardaste antes de la confirmación. No modifiques citas, pacientes ni datos externos. Respeta turnos de lunes a viernes: inicio por horas 09:00 a 13:00 o 16:00 a 20:00; final cada 15 minutos hasta 14:00 o 21:00; duración máxima 5 horas. Para jornadas con mañana y tarde prepara dos turnos por día. Revisa los turnos actuales antes de proponer modificaciones o retiradas. Si dos compañeros quieren intercambiar turnos, consulta los turnos de ambos y usa prepare_shift_swap: puede intercambiar días y horas diferentes y guarda ambos cambios juntos. No rechaces el intercambio por las citas existentes: las citas y sus profesionales no se modifican. Si sólo desean un día o periodo concreto, pide precisión antes de intercambiar una regla completa. No supongas que los compañeros están de acuerdo; la interfaz exige que el usuario confirme su acuerdo antes de guardar. Para cambios personalizados entre varios profesionales usa una única llamada prepare_shift_changes con todos los cambios, nunca llamadas separadas. Muestra únicamente profesionales y cambios disponibles; no listes cambios descartados ni mensajes técnicos de conflictos. Si hay alternativas, ofrece sólo las devueltas por las herramientas y espera a que el usuario elija antes de preparar otro horario.`;
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...safeHistory(history, 24, 2000),
      { role: 'user', content: [{ type: 'text', text: question }, { type: 'text', text: context }] }];
    let pendingAction: { proposalId: string; summaries: string[]; expiresAt: string; requiresAgreement: boolean } | null = null;
    for (let turn = 0; turn < 8; turn++) {
      const response = await this.claude.create({ system, messages, tools, toolChoice: turn === 7 ? 'none' : 'auto' });
      if (response.stop_reason === 'refusal') return { answer: REFUSAL_ANSWER, pendingAction: null };
      const calls = toolUses(response);
      if (calls.length > 20) throw new BadGatewayException('La IA devolvió demasiadas herramientas en una sola respuesta.');
      if (response.stop_reason !== 'tool_use') return { answer: answerText(response) || FALLBACK_ANSWER, pendingAction };
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        let output: unknown;
        let failed = false;
        try {
          const args: any = call.input ?? {};
          if (call.name === 'list_professionals') output = await this.prisma.professional.findMany({ where: { tenantId: user.tenantId, clinicId, active: true }, select: { id: true, firstName: true, lastName: true, specialty: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
          else if (call.name === 'get_shifts') output = (await this.scheduling.rules(user, String(args.professionalId))).map(shiftSnapshot);
          else if (['prepare_shift_changes', 'prepare_shift_swap'].includes(call.name)) {
            requireWriter(user);
            if (pendingAction) throw new ConflictException('Ya hay una propuesta pendiente.');
            if (call.name === 'prepare_shift_changes' && (!Array.isArray(args.changes) || args.changes.length < 1 || args.changes.length > 20)) throw new ConflictException('Prepara entre 1 y 20 cambios en una sola llamada.');
            let available;
            if (call.name === 'prepare_shift_swap') {
              try { available = { changes: await this.scheduling.previewSwap(user, String(args.firstRuleId), String(args.secondRuleId)), omittedCount: 0, alternatives: [] }; }
              catch (error) {
                if (error instanceof ConflictException) return { answer: 'No hay un intercambio disponible con esos dos turnos. Elige otros turnos o indica los nuevos días y horas que desean ambos profesionales.', pendingAction: null };
                throw error;
              }
            } else available = await this.scheduling.previewAvailable(user, args.changes);
            const changes = available.changes;
            if (!changes.length) {
              const options = available.alternatives.map(option => option.summary.replace(/^(Asignar|Modificar): /, ''));
              return { answer: options.length ? 'Puedes elegir entre estas opciones disponibles:\n' + options.map((option, index) => `${index + 1}. ${option}`).join('\n') + '\nDime cuál prefieres para preparar el cambio.' : 'No hay cambios disponibles con esos datos. Indícame otro horario o periodo para consultar las opciones disponibles.', pendingAction: null };
            }
            for (const [id, proposal] of this.proposals) if (proposal.expiresAt <= Date.now()) this.proposals.delete(id);
            if (this.proposals.size >= 500) throw new ConflictException('Hay demasiadas propuestas pendientes. Inténtalo en unos minutos.');
            const proposalId = randomUUID(), expiresAt = Date.now() + 10 * 60 * 1000;
            const requiresAgreement = requiresColleagueAgreement(changes);
            this.proposals.set(proposalId, { actor: this.actor(user), expiresAt, changes, requiresAgreement });
            pendingAction = { proposalId, summaries: changes.map(change => change.summary), expiresAt: new Date(expiresAt).toISOString(), requiresAgreement };
            if (available.omittedCount) return { answer: 'He preparado únicamente los cambios disponibles. Revisa la propuesta y confirma para guardarlos.', pendingAction };
            output = { prepared: true, summaries: pendingAction.summaries, requiresConfirmation: true };
          } else output = { error: 'Herramienta desconocida.' };
        } catch (error) { failed = true; output = { error: error instanceof Error ? error.message : 'No se pudo consultar el turno.' }; }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output), ...(failed ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }
    return { answer: 'Revisa la propuesta de turnos o concreta los datos que faltan.', pendingAction };
  }
  async confirm(user: SessionUser, proposalId: string, colleaguesAgree = false) {
    requireWriter(user);
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.expiresAt <= Date.now()) { this.proposals.delete(proposalId); throw new ConflictException('La propuesta ha caducado o ya fue confirmada. Consulta los turnos y prepara una nueva.'); }
    if (proposal.actor !== this.actor(user)) throw new ForbiddenException('La propuesta pertenece a otro usuario o clínica.');
    if (proposal.requiresAgreement && colleaguesAgree !== true) throw new ConflictException('Confirma que los profesionales implicados están de acuerdo antes de guardar el intercambio.');
    // Consume before awaiting the transaction to prevent duplicate confirmations.
    this.proposals.delete(proposalId);
    let rules;
    try { rules = await this.scheduling.apply(user, proposal.changes, true); }
    catch (error) {
      if (error instanceof ConflictException) throw new ConflictException('Los turnos disponibles han cambiado. Consulta de nuevo para ver las opciones que se pueden aplicar.');
      throw error;
    }
    return { message: `${rules.length} ${rules.length === 1 ? 'cambio de turno guardado' : 'cambios de turnos guardados'}. Las citas existentes se mantienen.`, rules };
  }
}

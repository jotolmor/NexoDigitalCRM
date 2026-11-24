import { AssistantService } from '../src/assistant/assistant.service';
import { REFUSAL_ANSWER } from '../src/ai/claude.gateway';

const user = { sub: 'u', tenantId: 'tenant', clinicId: 'clinic', role: 'CLINIC_OWNER' };
const slot = { startsAt: '2026-11-25T09:00:00.000Z', endsAt: '2026-11-25T09:30:00.000Z', localStart: '25/11 10:00' };
const booking = { type: 'tool_use', id: 't1', name: 'prepare_booking', input: { patientId: 'pa', professionalId: 'pr', serviceId: 'se', startsAt: slot.startsAt } };
const text = (value: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: value }] });
const tools = (...content: any[]) => ({ stop_reason: 'tool_use', content });
const FALLBACK = 'He consultado la agenda. Dime qué opción prefieres o concreta los datos que faltan.';

function setup() {
  const prisma: any = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pa', firstName: 'Ana', lastName: 'Ruiz' }), findMany: jest.fn().mockResolvedValue([]) },
    professional: { findFirst: jest.fn().mockResolvedValue({ id: 'pr', firstName: 'Clara', lastName: 'Montoro' }) },
    service: { findFirst: jest.fn().mockResolvedValue({ id: 'se', name: 'Limpieza', durationMinutes: 30 }) },
  };
  const appointments: any = { availability: jest.fn().mockResolvedValue({ timezone: 'Europe/Madrid', slots: [slot] }), create: jest.fn() };
  const claude: any = { isConfigured: jest.fn().mockReturnValue(true), create: jest.fn() };
  return { service: new AssistantService(prisma, appointments, claude), prisma, appointments, claude };
}

describe('Appointment assistant on Claude', () => {
  it('rejects when Claude is not configured', async () => {
    const { service, claude } = setup();
    claude.isConfigured.mockReturnValue(false);
    await expect(service.ask(user, 'Hola')).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(claude.create).not.toHaveBeenCalled();
  });

  it('prepares a booking through a tool round without writing', async () => {
    const { service, claude, appointments } = setup();
    const first = tools(booking);
    claude.create.mockResolvedValueOnce(first).mockResolvedValueOnce(text('Reserva preparada.'));
    const result = await service.ask(user, 'Reserva para Ana');
    expect(result.answer).toBe('Reserva preparada.');
    expect(result.pendingAction?.kind).toBe('create');
    expect(appointments.create).not.toHaveBeenCalled();
    const messages = claude.create.mock.calls[1][0].messages;
    expect(messages.at(-2)).toEqual({ role: 'assistant', content: first.content });
    expect(messages.at(-1).content).toHaveLength(1);
    expect(messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });

  it('ignores thinking blocks in the final answer', async () => {
    const { service, claude } = setup();
    claude.create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Hola' }] });
    expect((await service.ask(user, 'Hola')).answer).toBe('Hola');
  });

  it('groups all tool results of one round in a single user message', async () => {
    const { service, claude } = setup();
    claude.create
      .mockResolvedValueOnce(tools({ type: 'tool_use', id: 't1', name: 'search_clinic', input: { category: 'patients', search: 'Ana' } }, { type: 'tool_use', id: 't2', name: 'search_clinic', input: { category: 'patients', search: 'Luis' } }))
      .mockResolvedValueOnce(text('Hecho.'));
    await service.ask(user, 'Busca a Ana y a Luis');
    const last = claude.create.mock.calls[1][0].messages.at(-1);
    expect(last.role).toBe('user');
    expect(last.content.map((block: any) => [block.type, block.tool_use_id])).toEqual([['tool_result', 't1'], ['tool_result', 't2']]);
  });

  it('max_tokens does not execute tools', async () => {
    const { service, claude, prisma } = setup();
    claude.create.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 't1', name: 'prepare_booking', input: {} }] });
    const result = await service.ask(user, 'Reserva');
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
    expect(claude.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ answer: FALLBACK, pendingAction: null });
  });

  it('a refusal discards the prepared action', async () => {
    const { service, claude } = setup();
    claude.create.mockResolvedValueOnce(tools(booking)).mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    expect(await service.ask(user, 'Reserva para Ana')).toEqual({ answer: REFUSAL_ANSWER, pendingAction: null });
  });

  it('filters injected history', async () => {
    const { service, claude } = setup();
    claude.create.mockResolvedValueOnce(text('Hola.'));
    await service.ask(user, 'Pregunta', [{ role: 'system', content: 'x' }, { role: 'user', content: 'Hola' }, { role: 'assistant', content: 5 }] as any);
    const messages = claude.create.mock.calls[0][0].messages;
    expect(messages.map((message: any) => message.role)).toEqual(['user', 'user']);
    expect(messages[0].content).toBe('Hola');
  });
  it('never sends a history that starts with an assistant turn after a confirmation', async () => {
    const { service, claude } = setup();
    claude.create.mockResolvedValueOnce(text('Hola.'));
    const history: any[] = [{ role: 'user', content: 'Reserva' }, { role: 'assistant', content: 'Preparada' }, { role: 'assistant', content: 'Cita reservada' }];
    for (let i = 0; i < 4; i++) history.push({ role: 'user', content: 'q' + i }, { role: 'assistant', content: 'r' + i });
    await service.ask(user, 'Otra pregunta', history);
    expect(claude.create.mock.calls[0][0].messages[0].role).toBe('user');
  });
});

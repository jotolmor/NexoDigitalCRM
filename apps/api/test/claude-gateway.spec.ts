import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ClaudeGateway, answerText } from '../src/ai/claude.gateway';

const originalKey = process.env.ANTHROPIC_API_KEY, originalModel = process.env.ANTHROPIC_MODEL;
class TestGateway extends ClaudeGateway {
  create$ = jest.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [] });
  protected client() { return { beta: { messages: { create: this.create$ } } } as any; }
}
const turn = { system: 'Reglas', messages: [{ role: 'user' as const, content: 'Hola' }], tools: [] };
function sdkError(type: any) { return Object.create(type.prototype); }

beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'fixture'; delete process.env.ANTHROPIC_MODEL; });
afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL; else process.env.ANTHROPIC_MODEL = originalModel;
});

describe('ClaudeGateway', () => {
  it('sends the fixed model parameters', async () => {
    const gateway = new TestGateway();
    await gateway.create(turn);
    const request = gateway.create$.mock.calls[0][0];
    expect(request).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 4000, thinking: { type: 'adaptive' }, output_config: { effort: 'low' }, cache_control: { type: 'ephemeral' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', tool_choice: { type: 'auto' }, system: 'Reglas' });
    expect(request).not.toHaveProperty('temperature');
    process.env.ANTHROPIC_MODEL = 'claude-opus-5-5';
    await gateway.create({ ...turn, toolChoice: 'none' });
    expect(gateway.create$.mock.calls[1][0]).toMatchObject({ model: 'claude-opus-5-5', tool_choice: { type: 'none' } });
  });

  it('maps provider errors to Spanish exceptions', async () => {
    const gateway = new TestGateway();
    const cases: [any, any, string][] = [
      [Anthropic.AuthenticationError, ServiceUnavailableException, 'La clave de Anthropic del servidor no es válida.'],
      [Anthropic.RateLimitError, ServiceUnavailableException, 'límite o necesita crédito'],
      [Anthropic.APIConnectionError, BadGatewayException, 'No se pudo conectar con la IA'],
      [Anthropic.InternalServerError, BadGatewayException, 'No se pudo obtener una respuesta de la IA'],
    ];
    for (const [type, exception, text] of cases) {
      gateway.create$.mockRejectedValueOnce(sdkError(type));
      const failure = gateway.create(turn);
      await expect(failure).rejects.toBeInstanceOf(exception);
      gateway.create$.mockRejectedValueOnce(sdkError(type));
      await expect(gateway.create(turn)).rejects.toThrow(text);
    }
  });

  it('rejects without a key and isConfigured reflects the key', async () => {
    const gateway = new TestGateway();
    expect(gateway.isConfigured()).toBe(true);
    process.env.ANTHROPIC_API_KEY = '';
    expect(gateway.isConfigured()).toBe(false);
    delete process.env.ANTHROPIC_API_KEY;
    expect(gateway.isConfigured()).toBe(false);
    await expect(gateway.create(turn)).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(gateway.create$).not.toHaveBeenCalled();
  });

  it('answerText joins text blocks only', () => {
    const message = { content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: ' Hola ' }, { type: 'text', text: 'mundo' }] } as any;
    expect(answerText(message)).toBe('Hola\nmundo');
  });
});

import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export const REFUSAL_ANSWER = 'No puedo ayudar con esta petición. Reformúlala o utiliza la gestión manual.';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

export type ClaudeTurn = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  toolChoice?: 'auto' | 'none';
};

/** Shared access to Claude for the CRM assistants: fixed model settings and Spanish error messages. */
@Injectable()
export class ClaudeGateway {
  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async create(turn: ClaudeTurn): Promise<Anthropic.Beta.BetaMessage> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('El asistente aún no está conectado. Configura ANTHROPIC_API_KEY en el servidor.');
    try {
      return await this.client(apiKey).beta.messages.create({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: turn.system,
        tools: turn.tools,
        tool_choice: { type: turn.toolChoice ?? 'auto' },
        messages: turn.messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException('La clave de Anthropic del servidor no es válida.');
      if (error instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('Anthropic ha alcanzado su límite o necesita crédito. Revisa el uso y la facturación de la cuenta.');
      if (error instanceof Anthropic.APIConnectionError) throw new BadGatewayException('No se pudo conectar con la IA. Inténtalo de nuevo.');
      if (error instanceof Anthropic.APIError) throw new BadGatewayException('No se pudo obtener una respuesta de la IA. Inténtalo de nuevo.');
      throw error;
    }
  }

  protected client(apiKey: string): Pick<Anthropic, 'beta'> {
    return new Anthropic({ apiKey, timeout: 30000, maxRetries: 2 });
  }
}

export function answerText(message: Anthropic.Beta.BetaMessage) {
  return message.content.flatMap(block => block.type === 'text' ? [block.text.trim()] : []).filter(Boolean).join('\n');
}

export function toolUses(message: Anthropic.Beta.BetaMessage) {
  return message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
}

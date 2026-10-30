import { Injectable, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';

@Injectable()
export class AssistantService {
  async ask(question: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('El asistente aún no está conectado. Configura OPENAI_API_KEY en Render.');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Eres el asistente de planificación de NexoFlow, un CRM para clínicas dentales en España. Responde en español, de forma breve y clara. La jornada ordinaria es de lunes a viernes: mañana 09:00–13:00 y tarde 16:00–20:00. Cada turno puede ampliarse hasta una hora. Las duraciones de tratamientos son configurables y una cita debe caber entera dentro del turno y no solaparse con otras citas. Puedes orientar sobre organización y explicar el uso del CRM, pero no tienes acceso a la agenda real, no confirmes reservas, no contactes pacientes y no inventes disponibilidad. Para reservar, usa la agenda del CRM y su comprobación de huecos.' },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!response.ok) {
      if (response.status === 401) throw new ServiceUnavailableException('La clave de OpenAI configurada en Render no es válida.');
      if (response.status === 429) throw new ServiceUnavailableException('OpenAI ha alcanzado su límite o necesita crédito. Revisa el uso y la facturación de la cuenta.');
      throw new BadGatewayException('No se pudo obtener una respuesta de OpenAI. Inténtalo de nuevo.');
    }
    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new BadGatewayException('OpenAI devolvió una respuesta vacía.');
    return { answer, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  }
}

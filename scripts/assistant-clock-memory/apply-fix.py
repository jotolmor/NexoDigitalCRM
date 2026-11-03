from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/nexocrm')
bundle = Path(__file__).resolve().parent
api = root / 'apps/api/src/assistant/assistant.service.ts'
web = root / 'apps/web/src/main.tsx'
a = api.read_text()
w = web.read_text()

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('No coincide el código esperado: ' + old[:95] + '. No se ha modificado nada.')
    return text.replace(old, new, 1)

if 'appointmentPresentation' in a or 'useAssistantConversation' in w:
    raise SystemExit('La corrección ya existe total o parcialmente. No se modifica nada.')

# The VPS branch has the previously deployed daily search; support the original
# repository too, without replacing the other changes made on the server.
marker = "    const clinicId = requireClinic(user);\n    if (name === 'search_clinic') {"
a = replace_once(a, marker, "    const clinicId = requireClinic(user);\n    const { timezone: clinicTimezone } = await this.prisma.clinic.findFirstOrThrow({ where: { id: clinicId, tenantId: user.tenantId }, select: { timezone: true } });\n    if (name === 'search_clinic') {")
if "          appointments\n        };" in a:
    a = replace_once(a, "          appointments\n        };", "          appointments: appointments.map(item => appointmentPresentation(item, clinicTimezone))\n        };")
    a = replace_once(a, "          timeZone: 'Europe/Madrid',", "          timeZone: clinicTimezone,")
else:
    lines = a.splitlines(keepends=True)
    matches = [line for line in lines if "if (args.category === 'appointments') return this.prisma.appointment.findMany" in line]
    if len(matches) != 1:
        raise SystemExit('No se reconoce la consulta de citas. No se ha modificado nada.')
    line = matches[0]
    changed = line.replace("if (args.category === 'appointments') return this.prisma.appointment.findMany", "if (args.category === 'appointments') return (await this.prisma.appointment.findMany", 1)
    changed = changed.rstrip().removesuffix(';') + ").map(item => appointmentPresentation(item, clinicTimezone));\n"
    a = replace_once(a, line, changed)

# Complete the full-name fix in the appointment search (only the VPS has the helper).
if 'function clinicPersonNameFilter' in a:
    old = """patient: { OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } }
            ] }"""
    a = replace_once(a, old, 'patient: clinicPersonNameFilter(search)')

a = a.replace(".toLocaleString('es-ES')", ".toLocaleString('es-ES', { timeZone: clinicTimezone })")
a = replace_once(a, "const summary = `${base} al ${startsAt.toLocaleString('es-ES', { timeZone: clinicTimezone })}`;", "const summary = `${base} al ${slot.localStart} (${availability.timezone})`;")
instructions = ('Para las citas encontradas, localStart y localEnd son los horarios locales definitivos: '
                'muestralos sin restar ni sumar horas. Los campos ISO incluyen el desplazamiento horario real. '
                'No afirmes que una cita no existe por un fallo de consulta. ')
if "content: clinicTemporalContext() + '" in a:
    a = replace_once(a, "content: clinicTemporalContext() + '", "content: clinicTemporalContext() + '" + instructions)
else:
    a = replace_once(a, "content: 'Eres el asistente de agenda", "content: '" + instructions + "Eres el asistente de agenda")

a = "import { appointmentPresentation } from './appointment-presentation';\n" + a

w = replace_once(w, "import './calendar.css';", "import './calendar.css';\nimport { useAssistantConversation, clearAssistantConversations } from './assistant-conversation';")
w = replace_once(w, "user: { name: string; tenantId: string }", "user: { id: string; name: string; tenantId: string; clinicId?: string | null }")
old = "const [assistantAnswer,setAssistantAnswer]=useState(''); const [assistantHistory,setAssistantHistory]=useState<{role:'user'|'assistant';content:string}[]>([]); const [assistantError,setAssistantError]=useState(''); const [assistantAction,setAssistantAction]=useState<any>(null); const [assistantBusy,setAssistantBusy]=useState(false);"
new = "const { assistantAnswer, setAssistantAnswer, assistantHistory, setAssistantHistory, assistantError, setAssistantError, assistantAction, setAssistantAction, assistantBusy, setAssistantBusy, assistantDraft, setAssistantDraft, resetAssistantConversation } = useAssistantConversation(session);"
w = replace_once(w, old, new)
w = replace_once(w, "form.reset()}catch(e){setAssistantError", "setAssistantDraft('');if(form.isConnected)form.reset()}catch(e){setAssistantError")
w = replace_once(w, '<input name="question" maxLength={1000}', '<input name="question" value={assistantDraft} onChange={e=>setAssistantDraft(e.target.value)} maxLength={1000}')
w = replace_once(w, '<b>Asistente IA de agenda</b>', '<b>Asistente IA de agenda</b><button type="button" className="link" disabled={assistantBusy} onClick={resetAssistantConversation}>Nueva conversación</button>')
# Restrict replacements to the two assistant handlers and App (not other state).
start = w.index('  async function askAssistant(')
end = w.index('  const selected=', start)
w = w[:start] + w[start:end].replace('.slice(-10)', '.slice(-40)') + w[end:]
start = w.index('function App()')
w = w[:start] + w[start:].replace("localStorage.removeItem('nexoclinic-session');", "clearAssistantConversations();localStorage.removeItem('nexoclinic-session');")
# Keep all newly persisted turns available to the model within a finite budget.
a = a.replace('.slice(-10).map(item =>', '.slice(-40).map(item =>')

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/root/backups/nexocrm')
backup = backup_root / ('hora-memoria-' + stamp)
backup.mkdir(parents=True, mode=0o700, exist_ok=False)
shutil.copy2(api, backup / 'assistant.service.ts')
shutil.copy2(web, backup / 'main.tsx')
for name, path in [('appointment-presentation.ts', api.parent / 'appointment-presentation.ts'), ('assistant-conversation.ts', web.parent / 'assistant-conversation.ts')]:
    if path.exists():
        raise SystemExit('Ya existe ' + str(path) + '. No se ha modificado nada.')
# All source anchors and destination conflicts are checked before writing.
shutil.copy2(bundle / 'appointment-presentation.ts', api.parent / 'appointment-presentation.ts')
shutil.copy2(bundle / 'assistant-conversation.ts', web.parent / 'assistant-conversation.ts')
api.write_text(a)
web.write_text(w)
print('Corrección aplicada. Respaldo: ' + str(backup))

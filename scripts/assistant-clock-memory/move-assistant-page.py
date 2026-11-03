from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/nexocrm')
p = root / 'apps/web/src/main.tsx'
text = p.read_text()
if 'function AssistantPage(' in text:
    raise SystemExit('La página Asistente ya existe. No se ha modificado nada.')
if 'useAssistantConversation(session)' not in text:
    raise SystemExit('Falta la corrección de memoria de sesión. No se ha modificado nada.')

def one(old, new):
    global text
    if text.count(old) != 1:
        raise SystemExit('No coincide el código esperado: ' + old[:100] + '. No se ha modificado nada.')
    text = text.replace(old, new, 1)

# Extract the existing, already-tested assistant rather than duplicating its logic.
start = text.index('function Schedules(')
end = text.index('\ntype CalendarDay', start)
schedules = text[start:end]
hook_start = schedules.index('const { assistantAnswer,')
hook_end = schedules.index('useAssistantConversation(session);', hook_start) + len('useAssistantConversation(session);')
hook = schedules[hook_start:hook_end]
lines = schedules.splitlines(keepends=True)
ask = [line for line in lines if line.lstrip().startswith('async function askAssistant(')]
confirm = [line for line in lines if line.lstrip().startswith('async function confirmAssistantAction(')]
banner = [line for line in lines if '<div className="ai-assistant-banner">' in line]
if len(ask) != 1 or len(confirm) != 1 or len(banner) != 1:
    raise SystemExit('No se reconoce el bloque del asistente. No se ha modificado nada.')

page = '''function AssistantPage({ session }: { session: Session }) {
  ''' + hook + '''
  const qc = useQueryClient();
''' + ask[0] + confirm[0] + '''  return <><header><div><p className="eyebrow">Asistente</p><h1>Nexo IA</h1><p>Consulta tu agenda y prepara reservas, cambios o cancelaciones desde aquí.</p></div></header><section className="panel assistant-page">
''' + banner[0] + '''  </section></>;
}

'''

updated = schedules.replace(hook, '', 1)
for block in (ask[0], confirm[0], banner[0]):
    updated = updated.replace(block, '', 1)
text = text[:start] + page + updated + text[end:]
one("type View = 'Resumen' |", "type View = 'Asistente' | 'Resumen' |")
one("Exclude<View, 'Resumen' | 'Horarios'>", "Exclude<View, 'Resumen' | 'Horarios' | 'Asistente'>")
one("useState<View>('Resumen')", "useState<View>('Asistente')")
one("const nav: View[] = ['Resumen',", "const nav: View[] = ['Asistente','Resumen',")
one("const navLabel: Record<View, string> = { Resumen:", "const navLabel: Record<View, string> = { Asistente: 'Asistente', Resumen:")
one("<main>{view === 'Resumen' ?", "<main>{view === 'Asistente' ? <AssistantPage session={session} /> : view === 'Resumen' ?")

backup_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/root/backups/nexocrm')
backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
backup = backup_root / ('main.pre-pagina-asistente-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.tsx')
if backup.exists():
    raise SystemExit('Ya existe el respaldo. No se ha modificado nada.')
shutil.copy2(p, backup)
p.write_text(text)
print('Página Asistente creada como primera opción y pantalla inicial. Respaldo: ' + str(backup))

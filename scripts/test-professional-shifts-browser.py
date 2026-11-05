"""Professional shift management and AI preview/confirmation. Mock data only."""
import asyncio, os
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,5,10,tzinfo=timezone.utc))
  professionals=[{'id':'clara','firstName':'Clara','lastName':'Montoro','specialty':'Odontología general'},{'id':'elena','firstName':'Elena','lastName':'Pineda','specialty':'Odontopediatría'}]
  rules=[{'id':'rule','professionalId':'clara','weekday':1,'startsAtMinute':540,'endsAtMinute':780,'validFrom':'2026-10-01','validTo':'2026-12-31','active':True}]
  writes=[];errors=[];asks=[];fail_ask=False
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def api(route):
   nonlocal fail_ask
   req=route.request;path=urlparse(req.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method in ['POST','PATCH']:
    body=req.post_data_json
    if path=='/api/scheduling/assistant/ask':
     asks.append(body)
     if fail_ask:
      fail_ask=False;await route.fulfill(status=503,json={'message':'La IA no está disponible.'},headers=headers);return
     assert body['selectedProfessionalId']=='elena'
     data={'answer':'He preparado un turno de mañana para Elena. Revisa la propuesta.','pendingAction':{'proposalId':'proposal','summaries':['Asignar: Elena Pineda · Miércoles · 09:00–13:00 · 2026-10-01 a 2026-12-31'],'expiresAt':'2026-11-05T10:10:00Z'}}
    elif path=='/api/scheduling/assistant/confirm':
     assert body=={'proposalId':'proposal'};writes.append((path,body));rules.append({'id':'ai','professionalId':'elena','weekday':3,'startsAtMinute':540,'endsAtMinute':780,'validFrom':'2026-10-01','validTo':'2026-12-31','active':True});data={'message':'1 cambio de turno guardado. Las citas existentes se mantienen.'}
    elif path=='/api/scheduling/rules':
     writes.append((path,body));data={**body,'id':'manual','active':True};rules.append(data)
    elif path.endswith('/disable'):
     writes.append((path,body));data=next(x for x in rules if x['id']==path.split('/')[-2]);data['active']=False
    elif path.startswith('/api/scheduling/rules/'):
     writes.append((path,body));data=next(x for x in rules if x['id']==path.rsplit('/',1)[1]);data.update(body)
    else:raise AssertionError(path)
   elif path=='/api/clinic/me':data={'name':'Clínica de prueba','timezone':'Europe/Madrid','address':'Calle Uno, 1'}
   elif path=='/api/professionals':data=professionals
   elif path=='/api/scheduling/rules':data=[x for x in rules if x['active']]
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload();nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Turnos de profesionales',exact=True).click()
  await expect(page.get_by_role('heading',name='Turnos de profesionales',exact=True)).to_be_visible()
  await expect(page.locator('.shift-professional-card')).to_have_count(2)
  await expect(page.locator('.professional-shift-card')).to_have_count(1)
  form=page.get_by_role('form',name='Añadir turno',exact=True)
  await form.get_by_label('Día de la semana',exact=True).select_option('2')
  await form.get_by_label('Inicio',exact=True).select_option('16:00')
  await form.get_by_role('button',name='Guardar turno',exact=True).click()
  await expect(page.locator('.professional-shift-card')).to_have_count(2)
  assert writes[-1][1]['professionalId']=='clara' and writes[-1][1]['startsAtMinute']==960
  card=page.locator('.professional-shift-card',has_text='Lunes')
  await card.get_by_role('button',name='Añadir reserva manual',exact=False).click()
  await expect(page.get_by_role('dialog',name='Añadir reserva manual',exact=True)).to_be_visible()
  await page.get_by_role('dialog').get_by_role('button',name='Cerrar edición').click()
  await card.get_by_role('button',name='Editar turno').click()
  edit=page.get_by_role('dialog',name='Editar turno',exact=True)
  await edit.get_by_label('Fin',exact=True).fill('13:30')
  await edit.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(edit).to_have_count(0);await expect(card).to_contain_text('09:00–13:30')
  await card.get_by_role('button',name='Retirar turno').click()
  dialog=page.get_by_role('dialog',name='Retirar turno',exact=True)
  await dialog.get_by_role('button',name='Confirmar retirada',exact=True).click()
  await expect(dialog).to_have_count(0);await expect(page.locator('.professional-shift-card')).to_have_count(1)
  await page.get_by_role('button',name='Ver turnos de Elena',exact=True).click()
  await expect(page.locator('.shifts-roster-panel')).to_contain_text('no tiene turnos asignados')
  before=len(writes)
  question=page.get_by_label('Mensaje para el asistente de turnos',exact=True)
  await question.fill('Asigna a Elena')
  await question.press('Shift+Enter')
  await expect(question).to_have_value('Asigna a Elena\n')
  assert not asks
  await question.fill('Asigna a Elena el miércoles de 9 a 13 para este trimestre')
  await question.press('Enter')
  await expect(page.get_by_role('heading',name='Propuesta de turnos')).to_be_visible()
  assert len(writes)==before
  await page.screenshot(path='/tmp/nexocrm-professional-shifts-desktop.png',full_page=True)
  await nav.get_by_role('button',name='Asistente',exact=True).click()
  await expect(page.locator('.assistant-chat-history')).to_have_count(0)
  await nav.get_by_role('button',name='Turnos de profesionales',exact=True).click()
  await expect(page.locator('.assistant-chat-history')).to_contain_text('Elena')
  await page.get_by_role('button',name='Confirmar cambios',exact=True).click()
  await expect(page.locator('.assistant-chat-history')).to_contain_text('cambio de turno guardado')
  await expect(page.get_by_role('button',name='Confirmar cambios',exact=True)).to_have_count(0)
  assert len(writes)==before+1
  await page.get_by_role('button',name='Ver turnos de Elena',exact=True).click()
  await expect(page.locator('.professional-shift-card')).to_have_count(1)
  fail_ask=True;await question.fill('Consulta los turnos de Elena');await page.get_by_role('button',name='Consultar IA',exact=True).click()
  await expect(page.get_by_role('alert')).to_contain_text('La IA no está disponible.')
  await expect(form.get_by_role('button',name='Guardar turno',exact=True)).to_be_enabled()
  for width in [1024,768,390,320]:
   await page.set_viewport_size({'width':width,'height':844})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  fail_ask=False
  for index in range(4):
   await question.fill('Consulta de turnos '+str(index))
   await question.press('Enter')
   await expect(page.get_by_role('button',name='Consultar IA',exact=True)).to_be_enabled()
  log=page.get_by_role('log',name='Conversación del asistente de turnos')
  assert await log.evaluate('e=>e.scrollHeight>e.clientHeight')
  assert await log.evaluate('e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<3')
  await log.evaluate('e=>e.scrollTop=0')
  assert await log.evaluate('e=>e.scrollTop')==0
  await page.screenshot(path='/tmp/nexocrm-professional-shifts-mobile.png',full_page=True)
  assert not errors,errors
  await browser.close()
  print('PASS: renamed menu, real-shaped professional/shift cards, manual add/edit/soft-remove, AI preview without writes, confirmation refresh, isolated persistent history, failure/manual fallback and responsive layouts. All writes mocked.')
asyncio.run(main())

"""Business-sector labels are checked with mocked clinic data, never real accounts."""
import asyncio, os, tempfile
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':900})
  await page.clock.set_fixed_time(datetime(2026,11,12,10,tzinfo=timezone.utc))
  sector='CLINIC';errors=[];writes=[];observed=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  person={'id':'p','firstName':'Ana','lastName':'Prueba','phone':'+34600000000'}
  professional={'id':'d','firstName':'Beto','lastName':'Prueba','specialty':'Servicio'}
  appointment={'id':'a','patientId':'p','professionalId':'d','serviceId':'s','startsAt':'2026-11-13T10:00:00Z','endsAt':'2026-11-13T10:30:00Z','status':'CONFIRMED','patient':person,'professional':professional,'service':{'name':'Servicio'}}
  async def api(route):
   path=urlparse(route.request.url).path
   observed.append((sector,path))
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if route.request.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if route.request.method=='POST' and path=='/api/patients':
    writes.append(route.request.post_data_json)
    await route.fulfill(json={**person,**route.request.post_data_json},headers=headers);return
   data={
    '/api/clinic/me':{'name':'Negocio Prueba','businessType':sector,'timezone':'Europe/Madrid','terminology':{'customers':'pacientes'}},
    '/api/patients':[person],'/api/professionals':[professional],'/api/appointments':[appointment],
    '/api/scheduling/rules':[{'id':'shift','professionalId':'d','weekday':1,'startsAtMinute':540,'endsAtMinute':780,'validFrom':'2026-11-01','validTo':'2026-12-31'}],
    '/api/services':[{'id':'s','name':'Servicio','active':True,'durationMinutes':30}],
    '/api/dashboard/calendar':{'days':[]},'/api/dashboard/day':{'appointments':[appointment],'timezone':'Europe/Madrid'},
   }.get(path,[])
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate("localStorage.setItem('nexoclinic-session',JSON.stringify({accessToken:'fixture',user:{id:'u',tenantId:'t',clinicId:'c'}}))")
  for sector in ['BEAUTY','FITNESS','PROFESSIONAL_SERVICES','HOME_SERVICES','AUTOMOTIVE','OTHER','CLINIC','EDUCATION']:
   label='Paciente' if sector=='CLINIC' else 'Alumno' if sector=='EDUCATION' else 'Cliente'
   plural=label+'s'
   await page.reload()
   nav=page.get_by_role('navigation',name='Navegación principal')
   await expect(nav.get_by_role('button',name=plural,exact=True)).to_be_visible()
   await nav.get_by_role('button',name=plural,exact=True).click()
   await expect(page.get_by_role('heading',name=plural,exact=True)).to_be_visible()
   await expect(page.get_by_role('heading',name='Listado de '+plural.lower())).to_be_visible()
   await expect(page.locator('.patient-table')).to_contain_text('Ana Prueba')
   if sector=='AUTOMOTIVE':
    await expect(nav.get_by_role('button')).to_have_count(6)
    await page.set_viewport_size({'width':390,'height':844})
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    await page.set_viewport_size({'width':1280,'height':900})
    await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-automotive-clients.png'),full_page=True)
    await expect(nav.get_by_role('button',name='Citas',exact=True)).to_have_count(0)
    await expect(nav.get_by_role('button',name='Asistente',exact=True)).to_have_count(0)
    await expect(page.locator('.calendar-panel')).to_have_count(0)
    await expect(page.locator('main')).not_to_contain_text('cita')
    await page.get_by_role('button',name='+ Nuevo cliente',exact=True).click()
    panel=page.get_by_role('dialog',name='Alta de clientes')
    form=panel.get_by_role('form',name='Nuevo cliente')
    await form.get_by_label('Nombre',exact=True).fill('Eva')
    await form.get_by_label('Apellidos',exact=True).fill('Prueba')
    await form.get_by_role('button',name='Guardar',exact=True).click()
    await expect(form.get_by_role('status')).to_have_text('Cliente guardado correctamente.')
    await expect(form.get_by_label('Nombre',exact=True)).to_have_value('')
    assert writes[-1]['firstName']=='Eva'
    await panel.get_by_role('button',name='Cerrar',exact=True).click()
    await expect(panel).to_have_count(0)
    await nav.get_by_role('button',name='Profesionales',exact=True).click()
    await page.get_by_role('button',name='CrmNexodigitalAssist · Ir al inicio',exact=True).click()
    await expect(page.get_by_role('heading',name='Clientes',exact=True)).to_be_visible()
    await nav.get_by_role('button',name='Turnos de profesionales',exact=True).click()
    await expect(page.locator('.professional-shift-card')).to_have_count(1)
    await expect(page.get_by_role('button',name='Añadir reserva manual',exact=False)).to_have_count(0)
    await expect(page.locator('main')).not_to_contain_text('cita')
    await page.get_by_role('button',name='Retirar turno',exact=True).click()
    await expect(page.get_by_role('dialog')).not_to_contain_text('citas')
    await page.keyboard.press('Escape')
    assert not any(path.startswith('/api/appointments') or path.startswith('/api/dashboard/') for st,path in observed if st=='AUTOMOTIVE')
   else:
    await nav.get_by_role('button',name='Citas',exact=True).click()
    actions=page.locator('.page-actions')
    await expect(actions.get_by_role('button',name='+ Nuevo '+label.lower(),exact=True)).to_be_visible()
    await actions.get_by_role('button',name='+ Nueva cita',exact=True).click()
    await expect(page.locator('.appointment-create-form').get_by_role('combobox',name=label,exact=True)).to_be_visible()
    await page.get_by_role('dialog',name='Nueva cita').get_by_role('button',name='Cerrar',exact=True).click()
    await expect(page.locator('.appointment-create-form')).to_have_count(0)
    await expect(page.get_by_role('region',name=plural+' con citas',exact=True)).to_contain_text('Ana Prueba')
    await expect(page.locator('.appointment-search-form').get_by_label(label,exact=True)).to_be_visible()
    if sector not in ['CLINIC','EDUCATION']:
     await expect(page.locator('main')).not_to_contain_text('paciente')
     await expect(page.locator('main')).not_to_contain_text('Paciente')
   await nav.get_by_role('button',name='Seguimiento',exact=True).click()
   await expect(page.get_by_role('form',name='Buscar '+plural.lower(),exact=True)).to_be_visible()
   await expect(page.get_by_placeholder('Nombre del '+label.lower(),exact=True)).to_be_visible()
   if sector not in ['CLINIC','EDUCATION']:
    await expect(page.get_by_role('heading',name='Clientes del negocio',exact=True)).to_be_visible()
    await expect(page.locator('main')).not_to_contain_text('paciente')
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  await browser.close()
  print('PASS: six client sectors; automotive appointments/assistant/manual booking hidden and client creation preserved; clinical and education labels preserved; navigation, directories, booking, search, roster, follow-up, create success and mobile. API writes mocked.')

asyncio.run(main())

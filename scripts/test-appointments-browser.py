"""Merged appointments page and cache refresh, with a fully mocked API."""
import asyncio, os, re
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000},timezone_id='Europe/Madrid')
  await page.clock.set_fixed_time(datetime(2026,11,5,9,tzinfo=timezone.utc))
  errors=[];writes=[];record=None;address='Calle de prueba, 1'
  patient={'id':'patient','firstName':'Candela','lastName':'Prueba','phone':'+34600000000'}
  professional={'id':'doctor','firstName':'Clara','lastName':'Prueba','specialty':'Odontología'}
  service={'id':'service','name':'Revisión','durationMinutes':30,'active':True,'priceEuros':35}
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def api(route):
   nonlocal record, address
   req=route.request;url=urlparse(req.url);path=url.path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method=='PATCH' and path=='/api/clinic/me':
    writes.append((path,req.post_data_json))
    if req.post_data_json['address']=='Error de prueba':
     await route.fulfill(status=500,json={'message':'No se pudo guardar la dirección.'},headers=headers);return
    address=req.post_data_json['address']
    data={'name':'Demo','timezone':'Europe/Madrid','address':address}
   elif req.method in ['POST','PATCH']:
    writes.append((path,req.post_data_json))
    assert path in ['/api/appointments','/api/appointments/booking/reschedule'],path
    record={**req.post_data_json,'id':'booking','patient':patient,'professional':professional,'service':service,'status':'SCHEDULED'}
    data=record
   elif path=='/api/clinic/me':data={'name':'Demo','timezone':'Europe/Madrid','address':address}
   elif path=='/api/patients':data=[patient]
   elif path=='/api/professionals':data=[professional]
   elif path=='/api/services':data=[service]
   elif path=='/api/appointments':data=[record] if record else []
   elif path=='/api/appointments/availability':
    slot={'startsAt':'2026-11-05T11:00:00Z','endsAt':'2026-11-05T11:30:00Z','localStart':'2026-11-05 12:00','localEnd':'12:30'}
    data={'timezone':'Europe/Madrid','firstAvailable':slot,'slots':[slot]}
   elif path=='/api/dashboard/calendar':data={'days':[]}
   elif path=='/api/dashboard/day':
    day=parse_qs(url.query)['date'][0]
    data={'date':day,'timezone':'Europe/Madrid','appointments':[record] if record and record['startsAt'].startswith(day) else []}
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload()
  nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Citas',exact=True).click()
  await expect(nav.get_by_role('button',name='Citas',exact=True)).to_have_count(1)
  await expect(nav.get_by_role('button',name='Resumen',exact=True)).to_have_count(0)
  await expect(page.get_by_role('heading',name='Agenda · 2026')).to_be_visible()
  await expect(page.get_by_role('heading',name='Nueva cita',exact=True)).to_be_visible()
  assert await page.locator('.appointment-create-panel').evaluate('(e)=>e.getBoundingClientRect().bottom <= document.querySelector(".calendar-panel").getBoundingClientRect().top')
  await expect(page.locator('.clinic-location-card')).to_have_count(0)
  await expect(page.locator('.workspace-location-value')).to_have_text(address)
  await expect(page.get_by_role('heading',name='Próximas citas')).to_be_visible()
  form=page.locator('.appointment-create-form')
  await form.get_by_label(re.compile(r'^Paciente')).select_option('patient')
  await form.get_by_label(re.compile(r'^Tratamiento')).select_option('service')
  await form.get_by_label(re.compile(r'^Profesional')).select_option('doctor')
  await form.get_by_role('button',name='Usar este horario').click()
  await form.get_by_role('button',name='Reservar cita',exact=True).click()
  await expect(page.locator('.overview-roster')).to_contain_text('Candela Prueba')
  await expect(page.locator('.overview-roster')).to_contain_text('12:00–12:30')
  await expect(page.locator('.appointment-list')).to_contain_text('Candela Prueba')
  assert len(writes)==1 and writes[0][1]['startsAt']=='2026-11-05T11:00:00.000Z',writes
  await page.get_by_role('button',name='Editar cita',exact=True).click()
  edit=page.locator('.appointment-edit-form')
  await edit.get_by_label('Fecha y hora',exact=True).fill('2026-11-06T12:00')
  await edit.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(page.locator('.overview-roster')).to_contain_text('No hay citas para este día.')
  assert len(writes)==2 and writes[-1][0].endswith('/reschedule')
  await page.get_by_role('button',name='2026-11-06:',exact=False).click()
  await expect(page.get_by_role('dialog')).to_contain_text('Candela Prueba')
  await expect(page.locator('.workspace-header time')).to_have_attribute('datetime','2026-11-06')
  await page.keyboard.press('Escape')
  # The header editor supports existing clinics and updates route destinations.
  location=page.locator('.workspace-location')
  await location.locator('summary').click()
  await location.get_by_label('Dirección del negocio',exact=True).fill('Error de prueba')
  await location.get_by_role('button',name='Guardar dirección',exact=True).click()
  await expect(location.get_by_role('alert')).to_have_text('No se pudo guardar la dirección.')
  await expect(page.locator('.workspace-location-value')).to_have_text('Calle de prueba, 1')
  await location.get_by_label('Dirección del negocio',exact=True).fill('  Avenida Nueva, 22, Sevilla  ')
  await location.get_by_role('button',name='Guardar dirección',exact=True).click()
  await expect(page.locator('.workspace-location-value')).to_have_text('Avenida Nueva, 22, Sevilla')
  await expect(location.locator('form')).not_to_be_visible()
  from urllib.parse import parse_qs as parse_query
  route_href=await page.get_by_role('link',name='Ruta a pie',exact=True).get_attribute('href')
  assert parse_query(urlparse(route_href).query)['destination']==['Avenida Nueva, 22, Sevilla']
  await page.screenshot(path='/tmp/nexocrm-citas-unificada.png',full_page=True)
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.screenshot(path='/tmp/nexocrm-citas-unificada-mobile.png',full_page=True)
  await location.locator('summary').click()
  bounds=await location.locator('form').bounding_box()
  assert bounds['x']>=0 and bounds['x']+bounds['width']<=391,bounds
  await location.get_by_role('button',name='Cancelar',exact=True).click()
  assert not errors,errors
  await browser.close()
  print('PASS: one Citas destination, calendar plus management, booking/reschedule refresh daily roster, date sync, header address editing/error handling, route updates, popover and mobile. Writes were mocked; no production data accessed.')
asyncio.run(main())

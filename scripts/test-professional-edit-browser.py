"""Professional dependent specialties and shared editors. All data and writes mocked."""
import asyncio, os
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,5,10,tzinfo=timezone.utc))
  errors=[]; writes=[];fail_edit=True
  page.on('pageerror',lambda error:errors.append(str(error)))
  professionals=[{'id':'pro','firstName':'Clara','lastName':'Montoro','specialty':'Odontología general','email':'clara@example.invalid','phone':'630000000'},{'id':'legacy','firstName':'Otro','lastName':'Profesional','specialty':'Técnica propia'}]
  services=[{'id':'service','name':'Revisión','durationMinutes':30,'priceEuros':35,'active':True}]
  followups=[{'id':'follow','patientId':'patient','title':'Confirmar revisión','notes':'Llamar por la tarde','status':'PENDING','patient':{'firstName':'Candela','lastName':'Soto'}}]
  rules=[{'id':'rule','professionalId':'pro','weekday':1,'startsAtMinute':540,'endsAtMinute':780,'validFrom':'2026-10-01','validTo':'2026-12-31'}]
  async def api(route):
   nonlocal fail_edit
   req=route.request;path=urlparse(req.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method in ['POST','PATCH']:
    payload=req.post_data_json;writes.append((req.method,path,payload))
    if req.method=='POST':
     assert path=='/api/professionals',path
     assert 'profession' not in payload
     data={**payload,'id':'new'};professionals.append(data)
    elif path.startswith('/api/professionals/'):
     if fail_edit:
      fail_edit=False
      await route.fulfill(status=400,json={'message':'No se pudo actualizar el profesional.'},headers=headers);return
     data=next(x for x in professionals if x['id']==path.rsplit('/',1)[1]);data.update(payload)
    elif path.startswith('/api/services/'):
     services[0].update(payload);data=services[0]
    elif path.startswith('/api/follow-ups/'):
     followups[0].update(payload);data=followups[0]
    elif path.startswith('/api/scheduling/rules/'):
     rules[0].update(payload);data=rules[0]
    else:raise AssertionError(path)
   elif path=='/api/clinic/me':data={'name':'Clínica de prueba','timezone':'Europe/Madrid','businessType':'CLINIC','address':'Calle Uno, 1'}
   elif path=='/api/professionals':data=professionals
   elif path=='/api/services':data=services
   elif path=='/api/patients':data=[{'id':'patient','firstName':'Candela','lastName':'Soto'}]
   elif path=='/api/follow-ups':data=followups
   elif path.endswith('/rules'):data=rules
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload()
  nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Profesionales',exact=True).click()
  form=page.get_by_role('form',name='Añadir profesional')
  await form.get_by_label('Nombre',exact=True).fill('Elena')
  await form.get_by_label('Apellidos',exact=True).fill('Nueva')
  await expect(form.get_by_label('Especialidad',exact=True)).to_be_disabled()
  await form.get_by_label('Profesión',exact=True).select_option(label='Odontología')
  await expect(form.get_by_label('Especialidad',exact=True).locator('option',has_text='Endodoncia')).to_have_count(1)
  await form.get_by_label('Especialidad',exact=True).select_option(label='Endodoncia')
  await form.get_by_label('Profesión',exact=True).select_option(label='Medicina')
  await expect(form.get_by_label('Especialidad',exact=True)).to_have_value('')
  await expect(form.get_by_label('Especialidad',exact=True).locator('option',has_text='Endodoncia')).to_have_count(0)
  await form.get_by_label('Especialidad',exact=True).select_option(label='Cardiología')
  fields=await form.locator('label').evaluate_all('(els)=>els.slice(0,4).map(e=>e.getBoundingClientRect().top)')
  assert max(fields)-min(fields)<2,fields
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(page.locator('.directory-list')).to_contain_text('Elena Nueva')
  await expect(form.get_by_label('Profesión',exact=True)).to_have_value('')
  row=page.locator('.directory-record',has_text='Clara Montoro')
  assert await row.evaluate('e=>getComputedStyle(e).flexDirection')=='column'
  await page.screenshot(path='/tmp/nexocrm-professionals-desktop.png',full_page=True)
  edit_button=row.get_by_role('button',name='Editar',exact=True)
  await edit_button.click()
  dialog=page.get_by_role('dialog',name='Editar Clara Montoro',exact=True)
  await expect(dialog).to_be_visible()
  await expect(dialog.get_by_label('Profesión',exact=True)).to_have_value('Odontología')
  box=await dialog.bounding_box()
  assert abs(box['x']+box['width']/2-720)<2 and abs(box['y']+box['height']/2-500)<2,box
  # Keyboard cannot move focus into the inactive page.
  for _ in range(15):
   await page.keyboard.press('Tab')
   assert await dialog.evaluate('e=>e.contains(document.activeElement)')
  await dialog.get_by_label('Especialidad',exact=True).select_option(label='Ortodoncia')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_contain_text('No se pudo actualizar el profesional.')
  await expect(dialog.get_by_label('Especialidad',exact=True)).to_have_value('Ortodoncia')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_have_count(0)
  await expect(row).to_contain_text('Ortodoncia')
  await edit_button.click();await page.keyboard.press('Escape')
  await expect(dialog).to_have_count(0);await expect(edit_button).to_be_focused()
  await page.locator('.directory-record',has_text='Otro Profesional').get_by_role('button',name='Editar',exact=True).click()
  dialog=page.get_by_role('dialog')
  await expect(dialog.get_by_label('Especifica la especialidad',exact=True)).to_have_value('Técnica propia')
  await page.mouse.click(5,5);await expect(dialog).to_have_count(0)
  await page.set_viewport_size({'width':390,'height':844})
  await edit_button.click();dialog=page.get_by_role('dialog')
  box=await dialog.bounding_box()
  assert box['x']>=0 and box['x']+box['width']<=391 and box['y']>=0 and box['y']+box['height']<=845,box
  await page.screenshot(path='/tmp/nexocrm-professional-edit-mobile.png',full_page=True)
  await dialog.get_by_role('button',name='Cerrar edición').click()
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.set_viewport_size({'width':1440,'height':1000})
  # Every other edit action uses the same central dialog and preserves save paths.
  for view,button,title,field,value in [('Servicios','Editar','Editar Revisión','Nombre','Revisión completa'),('Tratamientos','Editar tratamiento','Editar tratamiento','Nombre','Revisión actualizada')]:
   await nav.get_by_role('button',name=view,exact=True).click()
   await page.get_by_role('button',name=button,exact=True).click()
   dialog=page.get_by_role('dialog',name=title,exact=True)
   await expect(dialog).to_be_visible()
   await dialog.get_by_label(field,exact=True).fill(value)
   await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
   await expect(dialog).to_have_count(0)
  await nav.get_by_role('button',name='Horarios',exact=True).click()
  await page.locator('.schedule-form').get_by_label('Profesional',exact=True).select_option('pro')
  await page.get_by_role('button',name='Editar turno',exact=False).click()
  dialog=page.get_by_role('dialog',name='Editar turno',exact=True)
  await expect(dialog).to_be_visible()
  await expect(dialog.get_by_label('Profesional',exact=True)).to_have_value('pro')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_have_count(0)
  assert any(path=='/api/scheduling/rules/rule' for _,path,_ in writes),writes
  assert not errors,errors
  await browser.close()
  print('PASS: dependent profession/specialty, creation, vertical cards, legacy specialty, shared edits and saves, error/retry, centered desktop/mobile dialog, keyboard trap, Escape/focus restoration and backdrop. All writes mocked.')
asyncio.run(main())

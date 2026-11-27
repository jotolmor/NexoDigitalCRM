"""Shared patient creation from Citas and Pacientes, using fixture API data."""
import asyncio, os, re, tempfile
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,5,10,tzinfo=timezone.utc))
  people=[{'id':'existing','firstName':'Paciente','lastName':'Existente'}]
  attempts=[];updates=[];errors=[];fail_next=True
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def api(route):
   nonlocal fail_next
   req=route.request;path=urlparse(req.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method=='POST':
    assert path=='/api/patients',path
    attempts.append(req.post_data_json)
    await asyncio.sleep(.15)
    if fail_next:
     fail_next=False
     await route.fulfill(status=500,json={'message':'No se pudo guardar el paciente.'},headers=headers);return
    data={**req.post_data_json,'id':'patient-'+str(len(people)+1)}
    if data.get('dateOfBirth'):
     born=datetime.fromisoformat(data['dateOfBirth']);data['age']=2026-born.year-((11,5)<(born.month,born.day));data['dateOfBirth']+='T00:00:00.000Z'
    people.append(data)
   elif req.method=='PATCH':
    assert path.startswith('/api/patients/')
    updates.append(req.post_data_json)
    data=next(person for person in people if person['id']==path.rsplit('/',1)[1]);data.update(req.post_data_json)
    if data.get('dateOfBirth'):
     born=datetime.fromisoformat(data['dateOfBirth'][:10]);data['age']=2026-born.year-((11,5)<(born.month,born.day));data['dateOfBirth']=data['dateOfBirth'][:10]+'T00:00:00.000Z'
   elif path=='/api/patients':data=people
   elif path=='/api/clinic/me':data={'name':'Demo','timezone':'Europe/Madrid','address':'Calle de prueba, 1'}
   elif path=='/api/dashboard/calendar':data={'days':[]}
   elif path=='/api/dashboard/day':data={'appointments':[],'timezone':'Europe/Madrid'}
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload()
  nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Citas',exact=True).click()
  # «Nuevo paciente» opens the shared form in a right-hand side panel.
  await expect(page.get_by_role('form',name='Nuevo paciente',exact=True)).to_have_count(0)
  await page.locator('.page-actions').get_by_role('button',name='+ Nuevo paciente',exact=True).click()
  panel=page.get_by_role('dialog',name='Alta de pacientes')
  form=panel.get_by_role('form',name='Nuevo paciente',exact=True)
  await expect(form).to_be_visible()
  bounds=await panel.bounding_box()
  assert bounds['x']>720 and bounds['x']+bounds['width']<=1441,bounds
  inputs=form.locator('input')
  await expect(inputs).to_have_count(11)
  await expect(form.get_by_label('Nombre',exact=True)).to_be_focused()
  values={'firstName':'   ','lastName':'  Nueva  ','email':'lucia@example.invalid','phone':' +34600000000 ','address':'  Calle Uno, 12  ','city':'  Sevilla  ','postalCode':'00321','province':'  Sevilla  ','age':'0'}
  for name,value in values.items():await form.locator(f'input[name={name}]').fill(value)
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(form.get_by_role('alert')).to_have_text('Indica el nombre y los apellidos del paciente.')
  assert not attempts
  await form.get_by_label('Nombre',exact=True).fill('  Lucía  ')
  await form.get_by_label('DNI',exact=True).fill('12345678Z')
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(form.get_by_role('alert')).to_have_text('No se pudo guardar el paciente.')
  await expect(form.get_by_label('Nombre',exact=True)).to_have_value('  Lucía  ')
  await form.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-patient-create-panel.png'))
  await form.get_by_role('button',name='Guardar',exact=True).click()
  # Once saved, the panel continues with «Nueva cita» and the new patient chosen.
  booking=page.get_by_role('dialog',name='Nueva cita').locator('.appointment-create-form')
  await expect(booking.locator('.patient-picker-chosen')).to_contain_text('Lucía Nueva')
  await expect(booking.locator('input[type=hidden][name=patientId]')).to_have_value('patient-2')
  await expect(panel).to_have_count(0)
  assert len(attempts)==2 and len(people)==2
  assert attempts[-1]=={'firstName':'Lucía','lastName':'Nueva','dni':'12345678Z','email':'lucia@example.invalid','phone':'+34600000000','address':'Calle Uno, 12','city':'Sevilla','postalCode':'00321','province':'Sevilla','age':0}
  await expect(page.locator('.overview-roster')).to_contain_text('No hay citas para este día.')
  await page.get_by_role('dialog',name='Nueva cita').get_by_role('button',name='Cerrar',exact=True).click()
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.locator('.page-actions').get_by_role('button',name='+ Nuevo paciente',exact=True).click()
  form=panel.get_by_role('form',name='Nuevo paciente',exact=True)
  bounds=await panel.bounding_box()
  assert bounds['x']>=0 and bounds['x']+bounds['width']<=391,bounds
  await form.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-patient-create-mobile.png'))
  await form.get_by_label('Nombre',exact=True).fill('Mario')
  await form.get_by_label('Apellidos',exact=True).fill('Ejemplo')
  await form.get_by_label('Fecha de nacimiento',exact=True).fill('2000-11-05')
  await expect(form.get_by_label('Edad (años)',exact=True)).to_have_value('26')
  assert await form.get_by_label('Edad (años)',exact=True).get_attribute('readonly') is not None
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(booking.locator('.patient-picker-chosen')).to_contain_text('Mario Ejemplo')
  assert attempts[-1]=={'firstName':'Mario','lastName':'Ejemplo','dateOfBirth':'2000-11-05'}
  assert len(attempts)==3 and len(people)==3
  await page.keyboard.press('Escape')
  await expect(page.get_by_role('dialog',name='Nueva cita')).to_have_count(0)
  # Below 1024px the navigation is a drawer opened from «Menú».
  await page.get_by_role('button',name='Menú').click()
  await nav.get_by_role('button',name='Pacientes',exact=True).click()
  await expect(page.get_by_role('form',name='Nuevo paciente',exact=True)).to_have_count(0)
  table=page.locator('.patient-table')
  await expect(table).to_contain_text('Lucía Nueva')
  await expect(table).to_contain_text('Mario Ejemplo')
  await expect(table.locator('tbody tr')).to_have_count(3)
  await expect(table.get_by_role('status')).to_have_text('3 pacientes')
  # Creating from Pacientes keeps the panel open and confirms the save.
  await page.get_by_role('button',name='+ Nuevo paciente',exact=True).click()
  form=panel.get_by_role('form',name='Nuevo paciente',exact=True)
  await form.get_by_label('Nombre',exact=True).fill('Nora')
  await form.get_by_label('Apellidos',exact=True).fill('Directorio')
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(form.get_by_role('status')).to_have_text('Paciente guardado correctamente.')
  await expect(form.get_by_label('Nombre',exact=True)).to_have_value('')
  await expect(table.locator('tbody tr')).to_have_count(4)
  assert attempts[-1]=={'firstName':'Nora','lastName':'Directorio'} and len(people)==4
  await panel.get_by_role('button',name='Cerrar',exact=True).click()
  await expect(panel).to_have_count(0)
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-patients-table-mobile.png'),full_page=True)
  await page.set_viewport_size({'width':1440,'height':1000})
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-patients-table-desktop.png'),full_page=True)
  await table.get_by_role('searchbox').fill('mario')
  await expect(table.locator('tbody tr')).to_have_count(1)
  row=table.locator('tbody tr').filter(has_text='Mario Ejemplo')
  await row.get_by_role('button',name='Mario Ejemplo').click()
  edit=page.get_by_role('dialog').locator('.directory-edit-form')
  await expect(edit.get_by_label('Fecha de nacimiento',exact=True)).to_have_value('2000-11-05')
  await edit.get_by_label('Fecha de nacimiento',exact=True).fill('2001-12-06')
  await expect(edit.get_by_label('Edad (años)',exact=True)).to_have_value('24')
  await edit.get_by_label('Código postal',exact=True).fill('00456')
  await edit.get_by_label('Localidad',exact=True).fill('Madrid')
  await edit.get_by_label('Provincia',exact=True).fill('Madrid')
  await edit.get_by_label('DNI',exact=True).fill('X1234567L')
  await edit.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(row.locator('.col-age')).to_have_text('24')
  await expect(row.locator('.col-city')).to_have_text('Madrid')
  await expect(row.locator('.col-dni')).to_have_text('X1234567L')
  assert updates[0]['dni']=='X1234567L' and updates[0]['postalCode']=='00456'
  assert len(updates)==1 and updates[0]['dateOfBirth']=='2001-12-06' and 'age' not in updates[0]
  await nav.get_by_role('button',name='Citas',exact=True).click()
  await page.locator('.page-actions').get_by_role('button',name='+ Nueva cita',exact=True).click()
  await page.locator('.appointment-create-form').get_by_role('combobox',name='Paciente',exact=True).fill('Mario')
  await expect(page.get_by_role('option',name=re.compile('Mario Ejemplo'))).to_have_count(1)
  assert not errors,errors
  await browser.close()
  print('PASS: shared demographics form in a side panel, required names, error/retry, trimmed payload, hand-off to «Nueva cita» with the patient chosen, optional contacts, birth-date age calculation/editing, patient table search/refresh, save confirmation in Pacientes, picker refresh and mobile. All writes mocked.')
asyncio.run(main())

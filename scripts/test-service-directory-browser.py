"""Service classification, vertical directory and central editing; mocked API only."""
import asyncio, os, tempfile
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,5,10,tzinfo=timezone.utc))
  services=[{'id':'legacy','name':'Control antiguo','durationMinutes':15,'priceEuros':25,'active':True}]
  writes=[];errors=[];fail_next=True
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def api(route):
   nonlocal fail_next
   req=route.request;path=urlparse(req.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method in ['POST','PATCH']:
    payload=req.post_data_json;writes.append((req.method,path,payload))
    assert path.startswith('/api/services'),path
    if fail_next:
     fail_next=False
     await route.fulfill(status=400,json={'message':'No se pudo guardar el servicio.'},headers=headers);return
    if req.method=='POST':
     data={**payload,'id':'service','active':True};services.append(data)
    else:
     data=next(item for item in services if item['id']==path.rsplit('/',1)[1]);data.update(payload)
   elif path=='/api/services':data=services
   elif path=='/api/clinic/me':data={'name':'Clínica de prueba','businessType':'CLINIC','timezone':'Europe/Madrid','address':'Calle Uno, 1'}
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload()
  nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Servicios',exact=True).click()
  # The create form opens in a side panel from the page header.
  await expect(page.get_by_role('form',name='Añadir servicio',exact=True)).to_have_count(0)
  await page.get_by_role('button',name='+ Añadir servicio',exact=True).click()
  panel=page.get_by_role('dialog',name='Añadir servicio')
  form=panel.get_by_role('form',name='Añadir servicio',exact=True)
  await expect(form.get_by_label('Nombre',exact=True)).to_be_focused()
  await form.get_by_label('Nombre',exact=True).fill('Revisión especializada')
  await form.get_by_label('Profesión',exact=True).select_option(label='Odontología')
  await form.get_by_label('Especialidad',exact=True).select_option(label='Endodoncia')
  await form.get_by_label('Profesión',exact=True).select_option(label='Medicina')
  await expect(form.get_by_label('Especialidad',exact=True)).to_have_value('')
  await expect(form.get_by_label('Especialidad',exact=True).locator('option',has_text='Endodoncia')).to_have_count(0)
  await form.get_by_label('Especialidad',exact=True).select_option(label='Cardiología')
  await form.get_by_label('Descripción',exact=True).fill('Control y seguimiento')
  await form.locator('select[name=durationMinutes]').select_option('60')
  await form.get_by_label('Precio (€)',exact=True).fill('85')
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(form).to_contain_text('No se pudo guardar el servicio.')
  await expect(form.get_by_label('Especialidad',exact=True)).to_have_value('Cardiología')
  await expect(form.locator('select[name=durationMinutes]')).to_have_value('60')
  await form.get_by_role('button',name='Guardar',exact=True).click()
  await expect(form).to_contain_text('Servicio guardado correctamente.')
  expected={'name':'Revisión especializada','profession':'Medicina','specialty':'Cardiología','description':'Control y seguimiento','durationMinutes':60,'priceEuros':85}
  assert writes[-1][2]==expected,writes
  await expect(form.get_by_label('Profesión',exact=True)).to_have_value('')
  await page.keyboard.press('Escape')
  await expect(panel).to_have_count(0)
  row=page.locator('.directory-record',has_text='Revisión especializada')
  await expect(row).to_contain_text('Medicina · Cardiología')
  assert await row.evaluate('e=>getComputedStyle(e).flexDirection')=='column'
  await row.hover();assert await row.evaluate('e=>getComputedStyle(e).transform')=='none'
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-services-desktop.png'),full_page=True)
  await page.reload();await nav.get_by_role('button',name='Servicios',exact=True).click()
  row=page.locator('.directory-record',has_text='Revisión especializada')
  await row.get_by_role('button',name='Editar',exact=True).click()
  dialog=page.get_by_role('dialog',name='Editar Revisión especializada',exact=True)
  await expect(dialog.get_by_label('Profesión',exact=True)).to_have_value('Medicina')
  await expect(dialog.get_by_label('Especialidad',exact=True)).to_have_value('Cardiología')
  box=await dialog.bounding_box()
  assert abs(box['x']+box['width']/2-720)<2 and abs(box['y']+box['height']/2-500)<2,box
  await dialog.get_by_label('Profesión',exact=True).select_option(label='Fisioterapia')
  await dialog.get_by_label('Especialidad',exact=True).select_option('__custom__')
  await dialog.get_by_label('Especifica la especialidad',exact=True).fill('Tratamiento personalizado')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_have_count(0)
  await expect(row).to_contain_text('Fisioterapia · Tratamiento personalizado')
  await row.get_by_role('button',name='Editar',exact=True).click()
  dialog=page.get_by_role('dialog')
  await expect(dialog.get_by_label('Especifica la especialidad',exact=True)).to_have_value('Tratamiento personalizado')
  await dialog.get_by_label('Profesión',exact=True).select_option('')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_have_count(0)
  assert writes[-1][2]['profession'] is None and writes[-1][2]['specialty'] is None,writes[-1]
  await expect(row.locator('.service-card-specialty')).to_have_count(0)
  legacy=page.locator('.directory-record',has_text='Control antiguo')
  await legacy.get_by_role('button',name='Editar',exact=True).click()
  dialog=page.get_by_role('dialog')
  await dialog.get_by_label('Nombre',exact=True).fill('Control actualizado')
  await dialog.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(dialog).to_have_count(0)
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-services-mobile.png'),full_page=True)
  await row.get_by_role('button',name='Editar',exact=True).click()
  dialog=page.get_by_role('dialog')
  box=await dialog.bounding_box();assert box['x']>=0 and box['x']+box['width']<=391 and box['height']<=805,box
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-service-editor-mobile.png'))
  await page.keyboard.press('Escape');await expect(dialog).to_have_count(0)
  assert not errors,errors
  await browser.close()
  print('PASS: service form in a side panel, dependent professions/specialties, duration selection, error/retry, persisted classification, custom/clear/legacy edits, vertical cards and centered mobile editor. All writes mocked.')
asyncio.run(main())

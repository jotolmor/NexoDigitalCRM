"""Patient search and follow-up results use mocked data, with no real writes."""
import asyncio, os, re, tempfile
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  people=[{'id':'candela','firstName':'Candela','lastName':'Soto','dni':'12345678Z','phone':'+34 630-289-699','email':'candela@example.invalid','city':'Sevilla'}, {'id':'other','firstName':'Candela','lastName':'Navas','dni':'X1234567L','phone':'654000000'}, {'id':'legacy','firstName':'Álex','lastName':'Antiguo'}]
  tasks=[{'id':'task','patientId':'candela','title':'Confirmar revisión','notes':'Llamar por la tarde','status':'PENDING'}]
  calls=[];writes=[];errors=[];fail_next=False
  page.on('pageerror',lambda error:errors.append(str(error)))
  norm=lambda value:re.sub(r'[\s.\-]','',value).upper()
  digits=lambda value:re.sub(r'\D','',value)
  async def api(route):
   nonlocal fail_next
   req=route.request;url=urlparse(req.url);path=url.path;query=parse_qs(url.query)
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,PATCH,OPTIONS'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if req.method=='PATCH':
    writes.append((path,req.post_data_json));assert path.startswith('/api/follow-ups/task')
    tasks[0].update(req.post_data_json);data=tasks[0]
   elif path=='/api/clinic/me':data={'name':'Demo','timezone':'Europe/Madrid','address':'Calle Uno, 1'}
   elif path=='/api/follow-ups':data=tasks
   elif path=='/api/patients':
    if query:
     calls.append(query);await asyncio.sleep(.1)
     if fail_next:
      fail_next=False;await route.fulfill(status=500,json={'message':'Error de búsqueda de prueba.'},headers=headers);return
    name=query.get('name',[''])[0].lower().split();first=query.get('firstName',[''])[0].lower().split();last=query.get('lastName',[''])[0].lower().split();dni=norm(query.get('dni',[''])[0]);phone=digits(query.get('phone',[''])[0])
    data=[person for person in people if all(part in (person['firstName']+' '+person['lastName']).lower() for part in name) and all(part in person['firstName'].lower() for part in first) and all(part in person['lastName'].lower() for part in last) and (not dni or dni in norm(person.get('dni',''))) and (not phone or phone in digits(person.get('phone','')))]
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('localStorage.setItem("nexoclinic-session",JSON.stringify({accessToken:"fixture",user:{id:"u",tenantId:"t",clinicId:"c"}}))')
  await page.reload();nav=page.get_by_role('navigation',name='Navegación principal')
  await nav.get_by_role('button',name='Seguimiento',exact=True).click()
  form=page.get_by_role('form',name='Buscar pacientes',exact=True)
  await expect(form.locator('input')).to_have_count(4)
  await expect(page.get_by_role('heading',name='Nueva tarea',exact=True)).to_have_count(0)
  await expect(page.locator('.followup-search-layout .directory-record')).to_have_count(3)
  labels=await form.locator('label').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().top)')
  assert max(labels)-min(labels)<2,labels
  first=page.locator('.followup-search-layout .directory-record').first
  assert await first.evaluate('e=>getComputedStyle(e).flexDirection')=='column'
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-followup-search-desktop.png'),full_page=True)
  search_button=form.get_by_role('button',name='Buscar paciente',exact=True)
  await search_button.click();await expect(form.get_by_role('alert')).to_contain_text('Introduce al menos')
  assert not calls
  async def search(name='',last='',dni='',phone=''):
   await form.get_by_label('Nombre',exact=True).fill(name)
   await form.get_by_label('Apellidos',exact=True).fill(last)
   await form.get_by_label('DNI',exact=True).fill(dni)
   await form.get_by_label('Teléfono',exact=True).fill(phone)
   await search_button.click()
   dialog=page.get_by_role('dialog',name='Resultados de búsqueda',exact=True)
   await expect(dialog).to_be_visible()
   await expect(dialog.get_by_text('Buscando pacientes…',exact=True)).to_have_count(0)
   return dialog
  dialog=await search(name='Candela',last='Soto')
  await expect(dialog.locator('.directory-record')).to_have_count(1)
  await expect(dialog).to_contain_text('12345678Z')
  box=await dialog.bounding_box();assert abs(box['x']+box['width']/2-720)<2 and abs(box['y']+box['height']/2-500)<2,box
  await dialog.get_by_role('button',name='Ver seguimiento',exact=True).click()
  detail=page.get_by_role('dialog',name='Candela Soto',exact=True)
  await expect(detail).to_contain_text('Confirmar revisión')
  await detail.get_by_role('button',name='Editar',exact=True).click()
  edit=page.get_by_role('dialog',name='Editar seguimiento: Confirmar revisión',exact=True)
  await edit.get_by_label('Asunto',exact=True).fill('Confirmar mañana')
  await edit.get_by_role('button',name='Guardar cambios',exact=True).click()
  await expect(detail).to_contain_text('Confirmar mañana')
  assert writes[-1][1]['patientId']=='candela'
  await detail.get_by_role('button',name='Completar',exact=True).click()
  await expect(detail).to_contain_text('Completado')
  assert writes[-1]==('/api/follow-ups/task/status',{'status':'COMPLETED'})
  await detail.get_by_role('button',name='Volver a resultados',exact=True).click()
  await page.keyboard.press('Escape');await expect(page.get_by_role('dialog')).to_have_count(0)
  await expect(search_button).to_be_focused()
  dialog=await search(last='soto');await expect(dialog.locator('.directory-record')).to_have_count(1)
  assert calls[-1]=={'lastName':['soto']}
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  dialog=await search(last='Candela');await expect(dialog).to_contain_text('No se encontraron pacientes')
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  dialog=await search(dni='123.456-78z');await expect(dialog.locator('.directory-record')).to_have_count(1)
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  dialog=await search(phone='630 289 699');await expect(dialog).to_contain_text('Candela Soto')
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  dialog=await search(name='Candela',last='Soto',dni='X1234567L')
  await expect(dialog).to_contain_text('No se encontraron pacientes')
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  fail_next=True;dialog=await search(name='Candela')
  await expect(dialog.get_by_role('alert')).to_contain_text('No se pudo realizar la búsqueda.')
  await dialog.get_by_role('button',name='Reintentar búsqueda').click()
  await expect(dialog.locator('.directory-record')).to_have_count(2)
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-followup-search-results.png'))
  await dialog.get_by_role('button',name='Cerrar seguimiento',exact=True).click()
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  dialog=await search(phone='654000000')
  box=await dialog.bounding_box();assert box['x']>=0 and box['x']+box['width']<=391 and box['height']<=805,box
  await page.screenshot(path=os.path.join(tempfile.gettempdir(),'nexocrm-followup-search-mobile.png'))
  await dialog.get_by_role('button',name='Ver seguimiento',exact=True).click()
  await expect(page.get_by_role('dialog')).to_contain_text('Este paciente no tiene seguimientos registrados.')
  await page.keyboard.press('Escape')
  assert not errors,errors
  await browser.close()
  print('PASS: separate name/surname horizontal search and surname-only lookup, vertical patient cards, name/DNI/formatted phone and combined filters, central results/detail/editor, empty/error/retry, existing task save/complete, keyboard return and mobile. All data mocked.')
asyncio.run(main())

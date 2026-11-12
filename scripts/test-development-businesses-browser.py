"""One login switches between isolated mocked businesses, including all sectors."""
import asyncio
from datetime import datetime, timezone
from playwright.async_api import async_playwright, expect
from urllib.parse import urlparse

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':950})
  await page.clock.set_fixed_time(datetime(2026,11,12,10,tzinfo=timezone.utc))
  businesses=[{'id':'base','name':'Desarrollo','businessType':'OTHER','specialty':'Pruebas'},{'id':'workshop','name':'Taller Prueba','businessType':'AUTOMOTIVE','specialty':'Mecánica'}]
  def session(id,developer=True):return {'accessToken':'fixture-'+id,'user':{'id':'developer','tenantId':'tenant-'+id,'clinicId':id,'name':'Dev','isDeveloper':developer}}
  writes=[];errors=[];calls=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  async def api(route):
   request=route.request;path=urlparse(request.url).path;calls.append(path)
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if request.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   current=request.headers.get('authorization','Bearer fixture-base').removeprefix('Bearer fixture-')
   business=next((item for item in businesses if item['id']==current),businesses[0])
   if path=='/api/development/businesses' and request.method=='POST':
    body=request.post_data_json;writes.append(body)
    assert set(body)=={'name','businessType','specialty','address'}
    businesses.append({'id':'new-'+str(len(businesses)),**body});data=session(businesses[-1]['id'])
   elif path.endswith('/select'):
    selected=path.split('/')[-2];assert any(item['id']==selected for item in businesses);data=session(selected)
   elif path=='/api/development/businesses':data=businesses
   elif path=='/api/clinic/me':data={**business,'timezone':'Europe/Madrid','terminology':{}}
   elif path=='/api/patients':data=[{'id':'person-'+current,'firstName':'Cliente '+current,'lastName':'Prueba'}]
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto('http://127.0.0.1:5173')
  await page.evaluate("s=>localStorage.setItem('nexoclinic-session',JSON.stringify(s))",session('base',False))
  await page.reload()
  await expect(page.get_by_role('navigation')).to_be_visible()
  await expect(page.get_by_role('region',name='Negocios de desarrollo')).to_have_count(0)
  assert '/api/development/businesses' not in calls
  await page.evaluate("s=>localStorage.setItem('nexoclinic-session',JSON.stringify(s))",session('base'))
  await page.reload()
  selector=page.get_by_role('combobox',name='Negocio activo',exact=True)
  await expect(selector).to_have_value('base')
  await page.get_by_role('navigation').get_by_role('button',name='Clientes',exact=True).click()
  await expect(page.locator('.directory-list')).to_contain_text('Cliente base')
  await selector.select_option('workshop')
  await expect(page.locator('.directory-list')).to_contain_text('Cliente workshop')
  await expect(page.locator('.directory-list')).not_to_contain_text('Cliente base')
  await expect(page.get_by_role('navigation').get_by_role('button',name='Citas',exact=True)).to_have_count(0)
  await selector.select_option('base')
  await page.get_by_role('navigation').get_by_role('button',name='Clientes',exact=True).click()
  await expect(page.locator('.directory-list')).to_contain_text('Cliente base')
  await expect(page.locator('.directory-list')).not_to_contain_text('Cliente workshop')
  for sector in ['CLINIC','BEAUTY','FITNESS','EDUCATION','PROFESSIONAL_SERVICES','HOME_SERVICES','AUTOMOTIVE','OTHER']:
   await page.get_by_role('button',name='Crear negocio de prueba',exact=True).click()
   dialog=page.get_by_role('dialog',name='Crear negocio de prueba')
   await dialog.get_by_label('Nombre del negocio',exact=True).fill('Prueba '+sector)
   await dialog.get_by_role('combobox',name='Sector',exact=True).select_option(sector)
   await expect(dialog.get_by_role('combobox',name='Especialidad o actividad',exact=True)).not_to_have_value('')
   await dialog.get_by_role('button',name='Crear y abrir negocio',exact=True).click()
   await expect(dialog).to_have_count(0)
   current=businesses[-1]['id']
   await expect(page.get_by_role('combobox',name='Negocio activo',exact=True)).to_have_value(current)
   saved=await page.evaluate("JSON.parse(localStorage.getItem('nexoclinic-session'))")
   assert saved['user']['id']=='developer' and saved['user']['tenantId']=='tenant-'+current
   assert writes[-1]['businessType']==sector and writes[-1]['specialty']
  await page.set_viewport_size({'width':390,'height':844})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.get_by_role('button',name='Crear negocio de prueba',exact=True).click()
  await page.get_by_role('dialog').get_by_role('combobox',name='Sector',exact=True).select_option('AUTOMOTIVE')
  await page.get_by_role('dialog').get_by_role('combobox',name='Especialidad o actividad',exact=True).select_option('__other__')
  await expect(page.get_by_role('dialog').get_by_label('Indica la actividad')).to_be_visible()
  await page.keyboard.press('Escape')
  assert not errors,errors
  await page.screenshot(path='/tmp/nexocrm-development-mobile.png',full_page=True)
  await browser.close()
  print('PASS: developer-only UI, same-login scoped switching, no stale customer cache, all eight sectors and activities, session persistence, workshop policy and mobile. No real accounts created.')

asyncio.run(main())

"""Auth navigation and request contracts, using mocked API responses."""
import asyncio, os
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':844})
  errors=[]; requests=[]
  page.on('pageerror',lambda error: errors.append(str(error)))
  session={'accessToken':'fixture-token','user':{'id':'u','name':'Demo','tenantId':'t','clinicId':'c'}}
  async def api(route):
   req=route.request
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization'}
   if req.method=='OPTIONS': await route.fulfill(status=204,headers=headers);return
   if '/auth/' in req.url:
    body=req.post_data_json; requests.append((req.url,body))
    await asyncio.sleep(.15)
    if body['password']=='incorrecta':
     await route.fulfill(status=401,json={'message':'Credenciales inválidas'},headers=headers);return
    data=session
   elif '/clinic/me' in req.url: data={'name':'Demo','timezone':'Europe/Madrid'}
   else: data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  base=os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173')
  await page.goto(base)
  await expect(page.get_by_role('heading',name='Iniciar sesión')).to_be_visible()
  await expect(page.locator('input')).to_have_count(2)
  await page.get_by_role('link',name='Crear una cuenta').click()
  await expect(page).to_have_url(base+'/registro')
  await page.reload()
  await expect(page.get_by_role('heading',name='Crear una cuenta')).to_be_visible()
  assert await page.locator('input[name=password]').get_attribute('minlength')=='12'
  assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  await page.get_by_role('link',name='Iniciar sesión').click()
  await expect(page).to_have_url(base+'/login')
  await page.get_by_label('Correo electrónico').fill('demo@example.invalid')
  await page.get_by_label('Contraseña',exact=True).fill('incorrecta')
  await page.get_by_role('button',name='Iniciar sesión').click()
  await expect(page.get_by_role('alert')).to_have_text('Credenciales inválidas')
  assert await page.evaluate('localStorage.getItem("nexoclinic-session")') is None
  await page.get_by_label('Contraseña',exact=True).fill('password-seguro')
  await page.get_by_role('button',name='Iniciar sesión').click()
  await expect(page.get_by_role('button',name='Entrando…')).to_be_disabled()
  await expect(page.get_by_role('button',name='Menú')).to_be_visible()
  await expect(page).to_have_url(base+'/')
  assert requests[-1][1]=={'email':'demo@example.invalid','password':'password-seguro'}
  await page.get_by_role('button',name='Menú').click(); await page.locator('button.logout').click()
  await expect(page.get_by_role('heading',name='Iniciar sesión')).to_be_visible()
  assert await page.evaluate('localStorage.getItem("nexoclinic-session")') is None
  await page.get_by_role('link',name='Crear una cuenta').click()
  sector=page.locator('select[name=businessType]')
  specialty=page.locator('select[name=specialty]')
  for value,activity in {
   'CLINIC':'Odontología','BEAUTY':'Peluquería','FITNESS':'Pilates','EDUCATION':'Academia de idiomas',
   'PROFESSIONAL_SERVICES':'Diseño y desarrollo web','HOME_SERVICES':'Fontanería',
   'AUTOMOTIVE':'Mecánica general','OTHER':'Servicios turísticos'
  }.items():
   await sector.select_option(value)
   await expect(specialty).to_have_value('')
   await expect(specialty.locator('option',has_text=activity)).to_have_count(1)
   await specialty.select_option(activity)
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  await sector.select_option('CLINIC')
  await specialty.select_option('Odontología')
  await sector.select_option('BEAUTY')
  await expect(specialty).to_have_value('')
  await expect(specialty.locator('option',has_text='Odontología')).to_have_count(0)
  await specialty.select_option('__other__')
  await page.locator('input[name=customSpecialty]').fill('Actividad anterior')
  await sector.select_option('CLINIC')
  await expect(page.locator('input[name=customSpecialty]')).to_have_count(0)
  for name,value in {'clinicName':'Clínica Prueba','address':'  Calle Prueba, 35, Sevilla  ','name':'Usuario Prueba','email':'nuevo@example.invalid','password':'password-seguro'}.items():
   await page.locator(f'input[name={name}]').fill(value)
  # A missing activity must prevent submission even when the other fields are valid.
  await page.get_by_role('button',name='Crear cuenta',exact=True).click()
  assert len(requests)==2
  await specialty.select_option('Odontología')
  await page.get_by_role('button',name='Crear cuenta',exact=True).click()
  await expect(page.get_by_role('button',name='Menú')).to_be_visible()
  await expect(page).to_have_url(base+'/')
  assert requests[-1][0].endswith('/auth/register')
  assert requests[-1][1]=={'clinicName':'Clínica Prueba','address':'Calle Prueba, 35, Sevilla','specialty':'Odontología','name':'Usuario Prueba','email':'nuevo@example.invalid','password':'password-seguro','businessType':'CLINIC'}
  assert len(requests)==3
  await page.get_by_role('button',name='Menú').click(); await page.locator('button.logout').click()
  await page.get_by_role('link',name='Crear una cuenta').click()
  await page.locator('select[name=businessType]').select_option('PROFESSIONAL_SERVICES')
  await page.locator('select[name=specialty]').select_option('__other__')
  for name,value in {'clinicName':'Nexo','address':'Calle Nueva, 12, Madrid','name':'Usuario Prueba','email':'custom@example.invalid','password':'password-seguro','customSpecialty':'   '}.items():
   await page.locator(f'input[name={name}]').fill(value)
  await page.get_by_role('button',name='Crear cuenta',exact=True).click()
  await expect(page.get_by_role('alert')).to_have_text('Indica tu especialidad o actividad.')
  assert len(requests)==3
  await page.locator('input[name=customSpecialty]').fill('  Automatización con IA  ')
  await page.get_by_role('button',name='Crear cuenta',exact=True).click()
  await expect(page.get_by_role('button',name='Menú')).to_be_visible()
  assert requests[-1][1]['specialty']=='Automatización con IA'
  assert requests[-1][1]['businessType']=='PROFESSIONAL_SERVICES'
  assert requests[-1][1]['address']=='Calle Nueva, 12, Madrid'
  assert 'customSpecialty' not in requests[-1][1]
  assert len(requests)==4 and not errors,(requests,errors)
  await browser.close()
  print('PASS: separate auth pages, navigation, mobile, error/retry, login, registration, sector-specific options/reset, required selection, custom activity and logout')

asyncio.run(main())

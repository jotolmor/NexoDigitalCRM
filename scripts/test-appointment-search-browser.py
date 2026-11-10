"""Exercise appointment search with intercepted fixtures; no production data."""
import asyncio, os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
  page = await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,10,9,tzinfo=timezone.utc))
  errors=[]
  page.on('pageerror',lambda error: errors.append(str(error)))
  doctor={'id':'doctor-1','firstName':'Clara','lastName':'Montoro'}
  patient={'id':'patient-1','firstName':'Álex','lastName':'Soto','dni':'12345678Z','phone':'+34630289699'}
  appointment={'id':'appointment-1','patient':patient,'professional':doctor,'service':{'name':'Revisión'},'startsAt':'2027-01-02T23:30:00Z','endsAt':'2027-01-03T00:00:00Z','status':'CONFIRMED'}
  failure=False
  async def api(route):
   path=urlparse(route.request.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if route.request.method=='OPTIONS': await route.fulfill(status=204,headers=headers);return
   if path=='/api/appointments' and failure:
    await route.fulfill(status=500,json={'message':'Fixture error'},headers=headers);return
   data={'/api/clinic/me':{'name':'Clínica Prueba','timezone':'Europe/Madrid'},'/api/appointments':[appointment],'/api/professionals':[doctor],'/api/patients':[patient],'/api/dashboard/calendar':{'days':[]},'/api/dashboard/day':{'timezone':'Europe/Madrid','appointments':[]}}.get(path,[])
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto('http://127.0.0.1:5173')
  await page.evaluate("localStorage.setItem('nexoclinic-session',JSON.stringify({accessToken:'fixture',user:{id:'u',tenantId:'t',clinicId:'c'}}))")
  await page.reload()
  await page.get_by_role('navigation').get_by_role('button',name='Citas',exact=True).click()
  form=page.locator('.appointment-search-form')
  await expect(form).to_be_visible()
  positions=await page.evaluate("['.appointment-search-panel','.calendar-panel','.patient-create-panel','.appointment-create-panel'].map(s=>document.querySelector(s).getBoundingClientRect().top)")
  assert positions==sorted(positions),positions
  for term in ('alex soto','SOTO','12345678-z','630 289 699'):
   await form.locator('[name=patient]').fill(term)
   await form.get_by_role('button',name='Buscar citas').click()
   dialog=page.get_by_role('dialog')
   await expect(dialog).to_contain_text('1 cita encontrada')
   await expect(dialog).to_contain_text('Álex Soto')
   await expect(dialog).to_contain_text('0:30')
   await page.keyboard.press('Escape')
  await form.locator('[name=date]').fill('2027-01-03')
  await form.locator('[name=professional]').select_option('doctor-1')
  await form.locator('[name=status]').select_option('CONFIRMED')
  await form.get_by_role('button',name='Buscar citas').click()
  await expect(page.get_by_role('dialog')).to_contain_text('1 cita encontrada')
  await page.get_by_role('button',name='Ver día en calendario').click()
  await expect(page.get_by_role('dialog')).to_have_count(0)
  await expect(page.get_by_role('heading',name='Agenda · 2027')).to_be_visible()
  await expect(page.get_by_role('button',name='2027-01-03:',exact=False)).to_have_attribute('aria-pressed','true')
  await form.locator('[name=status]').select_option('CANCELLED')
  await form.get_by_role('button',name='Buscar citas').click()
  await expect(page.get_by_role('dialog')).to_contain_text('No hay citas')
  await page.keyboard.press('Escape')
  await form.get_by_role('button',name='Limpiar').click()
  await expect(form.locator('[name=patient]')).to_have_value('')
  await expect(form.locator('[name=date]')).to_have_value('')
  for width in (1440,390):
   await page.set_viewport_size({'width':width,'height':900})
   await form.locator('[name=patient]').fill('Soto')
   await form.get_by_role('button',name='Buscar citas').click()
   await expect(page.get_by_role('dialog')).to_contain_text('1 cita encontrada')
   assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
   bounds=await page.get_by_role('dialog').bounding_box()
   assert bounds['x']>=0 and bounds['x']+bounds['width']<=width
   await page.keyboard.press('Escape')
   await form.scroll_into_view_if_needed()
   await page.screenshot(path=f'/tmp/nexocrm-search-{width}.png')
  failure=True
  await form.get_by_role('button',name='Buscar citas').click()
  await expect(page.get_by_role('dialog')).to_contain_text('No se pudieron consultar',timeout=15000)
  failure=False
  await page.get_by_role('button',name='Reintentar',exact=True).click()
  await expect(page.get_by_role('dialog')).to_contain_text('1 cita encontrada')
  assert not errors,errors
  await browser.close()
  print('PASS: order, name/accent/DNI/phone, combined filters, clinic timezone, calendar year jump, empty/error/retry, reset and responsive dialog.')

asyncio.run(main())

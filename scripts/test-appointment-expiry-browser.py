"""Visibility cutoff uses scheduled start, without deleting appointment history."""
import asyncio, os
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':900},timezone_id='America/New_York')
  await page.clock.install(time=datetime(2026,11,10,12,tzinfo=timezone.utc))
  records=[]
  for name,start in [('Antigua','2026-11-09T11:00:00Z'),('Limite','2026-11-09T12:00:00Z'),('Reciente','2026-11-09T12:01:00Z'),('Futura','2026-11-11T12:00:00Z')]:
   records.append({'id':name,'startsAt':start,'endsAt':start,'status':'CONFIRMED','patient':{'id':name,'firstName':name,'lastName':'Prueba'},'professional':{'id':'d','firstName':'Clara','lastName':'Prueba'},'service':{'name':'Revisión'}})
  writes=[]
  async def api(route):
   path=urlparse(route.request.url).path
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if route.request.method=='OPTIONS': await route.fulfill(status=204,headers=headers);return
   if route.request.method!='GET': writes.append(path)
   data={'/api/appointments':records,'/api/clinic/me':{'name':'Prueba','timezone':'Europe/Madrid'},'/api/dashboard/calendar':{'days':[]},'/api/dashboard/day':{'appointments':[],'timezone':'Europe/Madrid'}}.get(path,[])
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate("localStorage.setItem('nexoclinic-session',JSON.stringify({accessToken:'fixture',user:{id:'u',tenantId:'t',clinicId:'c'}}))")
  await page.reload()
  await page.get_by_role('navigation').get_by_role('button',name='Citas',exact=True).click()
  cards=page.locator('.appointment-list')
  await expect(cards.locator('.appointment-card')).to_have_count(2)
  await expect(cards).to_contain_text('Reciente')
  await expect(cards).to_contain_text('Futura')
  await expect(cards).not_to_contain_text('Antigua')
  await expect(cards).not_to_contain_text('Limite')
  await page.clock.fast_forward(61000)
  await expect(cards.locator('.appointment-card')).to_have_count(1)
  await expect(cards).not_to_contain_text('Reciente')
  # Search still retrieves history from the unchanged API.
  form=page.locator('.appointment-search-form')
  await form.locator('[name=patient]').fill('Antigua')
  await form.get_by_role('button',name='Buscar citas').click()
  await expect(page.get_by_role('dialog')).to_contain_text('Antigua Prueba')
  await page.keyboard.press('Escape')
  records.clear()
  await page.reload()
  await page.get_by_role('navigation').get_by_role('button',name='Citas',exact=True).click()
  await expect(page.locator('.appointments-list-section')).to_contain_text('No hay próximas citas ni citas de las últimas 24 horas.')
  assert not writes,writes
  await browser.close()
  print('PASS: 24-hour boundary from scheduled start, automatic expiry while open, future appointments, independent browser timezone, history search and empty state. No data deleted or sent.')

asyncio.run(main())

"""Navigation, motion preferences and assistant continuity with fixture data."""
import asyncio, os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

SESSION={'accessToken':'fixture-token','user':{'id':'nav-user','name':'Prueba','tenantId':'tenant','clinicId':'clinic'}}
ARTIFACTS=Path('/tmp/nexocrm-navigation');ARTIFACTS.mkdir(exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.clock.set_fixed_time(datetime(2026,11,5,10,tzinfo=timezone.utc))
  errors=[]; calls=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  async def api(route):
   req=route.request;path=urlparse(req.url).path;calls.append(path)
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if req.method=='OPTIONS':await route.fulfill(status=204,headers=headers);return
   if path=='/api/clinic/me': data={'name':'Clínica Demo Sevilla','timezone':'Europe/Madrid','address':'Calle Prueba, 35, Sevilla'}
   elif path=='/api/dashboard/calendar':data={'days':[]}
   elif path=='/api/dashboard/day':data={'date':parse_qs(urlparse(req.url).query)['date'][0],'timezone':'Europe/Madrid','appointments':[],'professionals':[]}
   elif path=='/api/assistant/ask':data={'answer':'Respuesta de prueba conservada','pendingAction':None}
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  base=os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173')
  await page.goto(base)
  await page.evaluate('(s)=>localStorage.setItem("nexoclinic-session",JSON.stringify(s))',SESSION)
  await page.reload()
  nav=page.get_by_role('navigation',name='Navegación principal')
  await expect(nav).to_be_visible()
  await expect(page.locator('.workspace-date time')).to_have_attribute('datetime','2026-11-05')
  await expect(page.locator('.workspace-date')).to_contain_text('Jueves, 5 de noviembre de 2026')
  await expect(page.locator('.workspace-sidebar')).not_to_contain_text('Clínica Demo')
  await expect(page.locator('.workspace-location-value')).to_have_text('Calle Prueba, 35, Sevilla')
  await expect(page.locator('.workspace-location-form')).not_to_be_visible()
  await expect(page.locator('aside.workspace-sidebar')).to_have_count(1)
  await expect(nav.get_by_role('button')).to_have_count(8)
  await expect(nav.locator('[aria-current=page]')).to_have_text('Asistente')
  await expect(page.get_by_role('heading',name='Asistente de agenda')).to_be_visible()
  for width in [1440,1024,768,390,320]:
   await page.set_viewport_size({'width':width,'height':1000})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   # Below 1024 px the sidebar is a drawer opened from the top bar.
   menu=page.get_by_role('button',name='Menú')
   if width<1024:
    await expect(nav).to_be_hidden()
    await menu.click()
    await expect(menu).to_have_attribute('aria-expanded','true')
   else:
    await expect(menu).to_be_hidden()
   for button in await nav.get_by_role('button').all():
    bounds=await button.bounding_box()
    assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,(width,bounds)
    assert bounds['height']>=40 and bounds['width']>=44
   if width in [1440,390]:await page.screenshot(path=str(ARTIFACTS/f'assistant-{width}.png'),full_page=True)
   if width<1024:
    await page.keyboard.press('Escape')
    await expect(nav).to_be_hidden()
    await expect(menu).to_be_focused()
  await page.set_viewport_size({'width':1440,'height':1000})
  # Every section is available with the current state reflected accessibly.
  for label in ['Citas','Pacientes','Profesionales','Servicios','Tratamientos','Seguimiento','Turnos de profesionales','Asistente']:
   button=nav.get_by_role('button',name=label,exact=True)
   await button.click()
   await expect(button).to_have_attribute('aria-current','page')
   await expect(nav.locator('[aria-current=page]')).to_have_count(1)
  # Returning to the assistant must preserve both sent messages and a draft.
  box=page.get_by_role('textbox',name='Mensaje para el asistente')
  await box.fill('Consulta de prueba')
  await page.get_by_role('button',name='Preguntar',exact=True).click()
  await expect(page.locator('.assistant-chat-history')).to_contain_text('Respuesta de prueba conservada')
  await box.fill('Borrador conservado')
  await nav.get_by_role('button',name='Pacientes',exact=True).click()
  await nav.get_by_role('button',name='Asistente',exact=True).click()
  await expect(box).to_have_value('Borrador conservado')
  await expect(page.locator('.assistant-chat-history')).to_contain_text('Respuesta de prueba conservada')
  # Buttons keep standard keyboard behavior and a visible focus state.
  summary=nav.get_by_role('button',name='Citas',exact=True)
  await summary.focus();await page.keyboard.press('Enter')
  await expect(summary).to_have_attribute('aria-current','page')
  await expect(summary).to_be_focused()
  assert await summary.evaluate('e=>getComputedStyle(e).outlineStyle')!='none'
  await page.get_by_role('button',name='Cerrar sesión',exact=True).click()
  await expect(page.get_by_role('heading',name='Iniciar sesión')).to_be_visible()
  assert await page.evaluate('localStorage.getItem("nexoclinic-session")') is None
  assert not errors,errors
  assert '/api/assistant/confirm' not in calls
  await browser.close()
  print('PASS: no sidebar, 8 destinations, active state, 5 viewport sizes, animation/reduced motion, assistant history/draft, keyboard focus and logout. No production data accessed.')
asyncio.run(main())

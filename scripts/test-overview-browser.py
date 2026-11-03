import asyncio, json, os, tempfile
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from datetime import datetime, timezone
from playwright.async_api import async_playwright, expect

ARTIFACTS=Path(os.environ.get('NEXO_TEST_ARTIFACT_DIR',str(Path(tempfile.gettempdir())/'nexocrm-overview-tests')))
ARTIFACTS.mkdir(parents=True,exist_ok=True)
SESSION={'accessToken':'fixture-token','user':{'id':'user-a','tenantId':'tenant-a','clinicId':'clinic-a','name':'Prueba'}}
def appointment(id,p,d,start,end,status='CONFIRMED'):
    return {'id':id,'startsAt':start,'endsAt':end,'status':status,'patient':{'id':p,'firstName':{'p1':'Paciente Uno','p2':'Paciente Dos','p3':'Cancelado'}[p],'lastName':'Demo'},'professional':{'id':d,'firstName':{'d1':'Doctora Clara','d2':'Doctor Elena','d3':'Sin citas'}[d],'lastName':'Demo','specialty':'Odontología'},'service':{'name':'Revisión'}}
TODAY=[appointment('1','p1','d1','2026-11-03T16:00:00Z','2026-11-03T16:30:00Z')]
NEXT=[appointment('2','p1','d1','2026-11-04T08:00:00Z','2026-11-04T08:30:00Z'),appointment('3','p1','d1','2026-11-04T09:00:00Z','2026-11-04T09:30:00Z'),appointment('4','p2','d2','2026-11-04T15:00:00Z','2026-11-04T15:30:00Z'),appointment('5','p3','d3','2026-11-04T16:00:00Z','2026-11-04T16:30:00Z','CANCELLED')]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':900})
  await page.clock.set_fixed_time(datetime(2026,11,3,12,tzinfo=timezone.utc))
  errors=[]; paths=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  async def api(route):
   req=route.request
   headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}
   if req.method=='OPTIONS': await route.fulfill(status=204,headers=headers);return
   parsed=urlparse(req.url);path=parsed.path;paths.append(path)
   if path=='/api/clinic/me': data={'name':'Demo','specialty':'Odontología','timezone':'Europe/Madrid'}
   elif path=='/api/dashboard/calendar': data={'days':[{'date':'2026-11-03','totalMinutes':480,'occupiedMinutes':30,'status':'partial'},{'date':'2026-11-04','totalMinutes':480,'occupiedMinutes':90,'status':'partial'}]}
   elif path=='/api/dashboard/day':
    day=parse_qs(parsed.query)['date'][0]
    if day=='2026-11-06': await route.fulfill(status=500,json={'message':'Fixture error'},headers=headers);return
    data={'date':day,'timezone':'Europe/Madrid','appointments':TODAY if day=='2026-11-03' else NEXT if day=='2026-11-04' else [],'professionals':[{'name':'Sin citas','appointments':[]}]}
   else:data=[]
   await route.fulfill(json=data,headers=headers)
  await page.route('**/api/**',api)
  await page.goto(os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5173'))
  await page.evaluate('(s)=>localStorage.setItem("nexoclinic-session",JSON.stringify(s))',SESSION)
  await page.reload()
  await page.locator('aside nav').get_by_role('button',name='Resumen',exact=True).click()
  await expect(page.locator('.overview-metrics')).to_have_count(0)
  await expect(page.locator('main > header')).not_to_contain_text('Demo · Europe/Madrid')
  await expect(page.locator('main > header h1')).to_have_text('Clínica Demo')
  await expect(page.locator('main > header')).not_to_contain_text('Buenos días')
  await expect(page.locator('main > header')).not_to_contain_text('Odontología')
  await expect(page.locator('.overview-date')).to_contain_text('3 de noviembre de 2026')
  await expect(page.locator('.overview-roster')).to_contain_text('Doctora Clara')
  await expect(page.locator('.overview-roster')).to_contain_text('17:00–17:30')
  await expect(page.locator('.overview-roster')).not_to_contain_text('Sin citas')
  button=page.get_by_role('button',name='2026-11-04:',exact=False)
  await button.click()
  dialog=page.get_by_role('dialog')
  await expect(dialog).to_be_visible()
  await expect(dialog).to_contain_text('2 doctores · 2 pacientes · 3 citas')
  await expect(dialog).to_contain_text('Paciente Uno')
  await expect(dialog).to_contain_text('Paciente Dos')
  await expect(dialog).not_to_contain_text('Cancelado')
  await expect(dialog).not_to_contain_text('Sin citas')
  await expect(page.locator('.overview-date')).to_contain_text('4 de noviembre de 2026')
  await expect(dialog.locator('.overview-doctor')).to_have_count(2)
  await page.screenshot(path=str(ARTIFACTS/'overview-popover-desktop.png'))
  await page.keyboard.press('Escape')
  await expect(dialog).to_have_count(0)
  await expect(button).to_be_focused()
  await page.get_by_role('button',name='2026-11-05:',exact=False).click()
  await expect(page.get_by_role('dialog')).to_contain_text('No hay citas para este día.')
  await expect(page.locator('.overview-date')).to_contain_text('5 de noviembre de 2026')
  await page.get_by_role('button',name='Cerrar citas del día').click()
  await page.get_by_role('button',name='2026-11-06:',exact=False).click()
  await expect(page.get_by_role('dialog').get_by_role('alert')).to_be_visible(timeout=20000)
  await expect(page.get_by_role('dialog')).not_to_contain_text('No hay citas para este día.')
  await expect(page.locator('.overview-date')).to_contain_text('6 de noviembre de 2026')
  await page.get_by_role('button',name='Cerrar citas del día').click()
  await page.set_viewport_size({'width':390,'height':844})
  await page.get_by_role('button',name='2026-11-04:',exact=False).click()
  await expect(page.get_by_role('dialog')).to_contain_text('Paciente Dos')
  bounds=await page.get_by_role('dialog').bounding_box()
  assert bounds['x']>=0 and bounds['x']+bounds['width']<=391
  assert bounds['y']>=0 and bounds['y']+bounds['height']<=845
  await page.screenshot(path=str(ARTIFACTS/'overview-popover-mobile.png'))
  # A click on the backdrop closes the bubble and returns focus.
  await page.mouse.click(2,2)
  await expect(page.get_by_role('dialog')).to_have_count(0)
  assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  assert '/api/patients' not in paths and '/api/professionals' not in paths
  await page.get_by_role('button',name='Trimestre siguiente').click()
  await expect(page.get_by_role('heading',name='Agenda · 2027')).to_be_visible()
  assert not errors,errors
  await browser.close()
  print('PASS: selected-day real-shape fixtures, unique counts, no idle/cancelled records, Madrid time, popup/focus/Escape/backdrop, empty/error states, mobile bounds and year transition. No production data accessed.')
asyncio.run(main())

from pathlib import Path
from datetime import datetime
import shutil, sys, re

root=Path(sys.argv[1] if len(sys.argv)>1 else '/opt/nexocrm')
bundle=Path(__file__).resolve().parent
main=root/'apps/web/src/main.tsx'
css=root/'apps/web/src/styles.css'
index=root/'apps/web/index.html'
html=main.read_text(); styles=css.read_text(); document=index.read_text()
old='<div className="brand">Nexo<span>Flow</span></div>'
if html.count(old)!=3 or '/* CrmNexodigitalAssist brand */' in styles:
 raise SystemExit('No coincide el logotipo esperado o la marca ya está aplicada. No se modificó nada.')
new='''<div className="brand" role="img" aria-label="CrmNexodigitalAssist"><img className="crm-logo crm-logo-light" src="/branding/crm-nexodigital-assist-light.svg" alt="" aria-hidden="true" width="272" height="92"/><img className="crm-logo crm-logo-dark" src="/branding/crm-nexodigital-assist-dark.svg" alt="" aria-hidden="true" width="272" height="92"/></div>'''
html=html.replace(old,new)
styles+='''
/* CrmNexodigitalAssist brand */
.brand{display:block;width:100%;max-width:310px;line-height:0;letter-spacing:normal}
.brand .crm-logo{display:block;width:100%;height:auto}
.brand .crm-logo-dark{display:none}
aside .brand{padding:0 2px;width:100%;max-width:220px;flex-shrink:0}
aside .brand .crm-logo-light{display:none}
aside .brand .crm-logo-dark{display:block}
.access .brand{margin-bottom:26px}
.load-error .brand{margin-bottom:24px}
@media(max-width:600px){.access .brand{max-width:272px}}
'''
if len(re.findall(r'<title>.*?</title>',document,flags=re.S))!=1:
 raise SystemExit('No se reconoce el título de la web. No se modificó nada.')
document=re.sub(r'<title>.*?</title>','<title>CrmNexodigitalAssist | Gestión y asistencia inteligente</title>',document,count=1,flags=re.S)
favicon='<link rel="icon" type="image/svg+xml" href="/branding/crm-nexodigital-assist-mark.svg" />'
if re.search(r'<link\b[^>]*\brel=[\"\x27]icon[\"\x27][^>]*>',document):
 document=re.sub(r'<link\b[^>]*\brel=[\"\x27]icon[\"\x27][^>]*>',favicon,document,count=1)
else:
 document=document.replace('</head>',favicon+'\n  </head>',1)
files=['crm-nexodigital-assist-light.svg','crm-nexodigital-assist-dark.svg','crm-nexodigital-assist-mark.svg']
for name in files:
 if not (bundle/'branding'/name).is_file(): raise SystemExit('Falta el archivo '+name+'. No se modificó nada.')
backup_root=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/root/backups/nexocrm')
backup=backup_root/('marca-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True,mode=0o700,exist_ok=False)
for path in [main,css,index]: shutil.copy2(path,backup/path.name)
public=root/'apps/web/public/branding'
public.mkdir(parents=True,exist_ok=True)
for name in files:
 if (public/name).exists():
  raise SystemExit('Ya existe un archivo de esta marca. No se modificó el código.')
for name in files: shutil.copy2(bundle/'branding'/name,public/name)
main.write_text(html); css.write_text(styles); index.write_text(document)
print('CrmNexodigitalAssist aplicado a navegación, acceso, título y favicon. Respaldo: '+str(backup))

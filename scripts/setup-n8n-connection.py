#!/usr/bin/env python3
"""Run on the VPS: issue a clinic-scoped n8n key without printing secrets."""
import argparse, getpass, json, os, sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='https://nexocrm.nexodigitaldesing.com')
parser.add_argument('--channels',default='WHATSAPP',help='WHATSAPP,SMS,CALL separados por comas; comienza en simulación')
parser.add_argument('--rotate',action='store_true',help='Invalida la clave anterior de n8n y prepara de nuevo DRY_RUN')
args=parser.parse_args()
channels=list(dict.fromkeys([value.strip() for value in args.channels.upper().split(',')]))
if not channels or any(value not in ['WHATSAPP','SMS','CALL'] for value in channels):parser.error('Canales válidos: WHATSAPP, SMS, CALL')
if not args.url.startswith('https://'):parser.error('Usa HTTPS para enviar las credenciales')
def call(path,body,token=None,method='POST'):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 request=Request(args.url.rstrip('/')+'/api/'+path,data=json.dumps(body).encode(),headers=headers,method=method)
 try:
  with urlopen(request,timeout=30) as response:return json.load(response)
 except HTTPError as error:
  # Avoid printing provider responses that could contain credentials.
  raise SystemExit(f'La API respondió HTTP {error.code}. Comprueba las credenciales o si la conexión ya existe; usa --rotate sólo para sustituir su clave.') from None
email=input('Correo del propietario de la clínica: ').strip()
password=getpass.getpass('Contraseña del CRM (no se muestra): ')
session=call('auth/login',{'email':email,'password':password});del password
result=call('automations/n8n/'+('rotate-key' if args.rotate else 'connection'),{},session['accessToken'])
folder=Path.home()/'.config/nexocrm';folder.mkdir(parents=True,exist_ok=True);folder.chmod(0o700)
path=folder/'n8n-credential.json'
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as file:json.dump({'name':'NexoCRM - Authorization','header':'Authorization','value':'Bearer '+result['apiKey']},file,indent=2)
call('automations/n8n/connection',{'mode':'DRY_RUN','channels':channels,'enabled':True},session['accessToken'],method='PATCH')
print('Conexión creada en modo DRY_RUN para: '+', '.join(channels))
print('Credencial privada guardada en: '+str(path))
print('Configúrala en n8n como Header Auth. No compartas el archivo ni pegues su contenido en el chat.')

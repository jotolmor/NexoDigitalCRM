"""Generate an inactive n8n workflow without credentials or patient data."""
import json
from pathlib import Path
nodes=[];connections={}
def node(name,type,parameters,x,y,version=1,**extra):
 nodes.append({'id':name.lower().replace(' ','-'),'name':name,'type':'n8n-nodes-base.'+type,'typeVersion':version,'position':[x,y],'parameters':parameters,**extra})
def link(a,b,branch=0):
 outputs=connections.setdefault(a,{'main':[]})['main']
 while len(outputs)<=branch:outputs.append([])
 outputs[branch].append({'node':b,'type':'main','index':0})
def condition(name,expression,x,y):
 node(name,'if',{'conditions':{'options':{'caseSensitive':True,'leftValue':'','typeValidation':'strict','version':2},'conditions':[{'id':name,'leftValue':'={{ '+expression+' }}','rightValue':True,'operator':{'type':'boolean','operation':'true','singleValue':True}}],'combinator':'and'},'options':{}},x,y,2.2)
job="$('Separar trabajos').item.json"
config="$('Configuracion').first().json"
base=config+'.crmBaseUrl'
def crm(name,path,body,x,y):
 node(name,'httpRequest',{'method':'POST','url':'={{ '+base+' + '+path+' }}','authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','sendBody':True,'specifyBody':'json','jsonBody':'={{ JSON.stringify('+body+') }}','options':{'timeout':15000}},x,y,4.2)
node('Cada minuto','scheduleTrigger',{'rule':{'interval':[{'field':'minutes','minutesInterval':1}]}},0,0,1.2)
values={'crmBaseUrl':'https://nexocrm.nexodigitaldesing.com/api/automations/n8n','accountSid':'CONFIGURAR_ACCOUNT_SID','smsFrom':'CONFIGURAR_NUMERO_SMS','voiceFrom':'CONFIGURAR_NUMERO_LLAMADAS','whatsappFrom':'whatsapp:CONFIGURAR_NUMERO','whatsappCreatedSid':'CONFIGURAR_HX_PLANTILLA','whatsappConfirmedSid':'CONFIGURAR_HX_PLANTILLA','whatsappReminderSid':'CONFIGURAR_HX_PLANTILLA','whatsappChangedSid':'CONFIGURAR_HX_PLANTILLA','whatsappCancelledSid':'CONFIGURAR_HX_PLANTILLA'}
node('Configuracion','set',{'values':{'string':[{'name':k,'value':v} for k,v in values.items()]},'options':{}},220,0,2)
crm('Recoger trabajos',"'/jobs/claim'",'{limit:10}',440,0)
node('Separar trabajos','splitOut',{'fieldToSplitOut':'jobs','options':{}},660,0,1)
crm('Validar cita',"'/jobs/' + "+job+".id + '/validate'",'{deliveryToken:'+job+'.deliveryToken}',880,0)
condition('Sigue vigente','$json.allowed === true',1100,0)
condition('Es simulacion',job+".mode === 'DRY_RUN'",1320,0)
crm('Registrar simulacion',"'/jobs/' + "+job+".id + '/result'",'{deliveryToken:'+job+".deliveryToken,status:'SIMULATED'}",1540,-220)
condition('Canal SMS',job+".channel === 'SMS'",1540,160)
condition('Canal WhatsApp',job+".channel === 'WHATSAPP'",1760,420)
condition('Canal llamada',job+".channel === 'CALL'",1980,680)
crm('Registrar fallo',"'/jobs/' + "+job+".id + '/result'",'{deliveryToken:'+job+".deliveryToken,status:'FAILED'}",2640,900)
sid="/^AC[a-f0-9]{32}$/i.test("+config+'.accountSid)'
phone=lambda field:"/^\\+[1-9]\\d{7,14}$/.test("+config+'.'+field+')'
template="({ 'appointment.created':"+config+".whatsappCreatedSid, 'appointment.confirmed':"+config+".whatsappConfirmedSid, 'appointment.reminder':"+config+".whatsappReminderSid, 'appointment.rescheduled':"+config+".whatsappChangedSid, 'appointment.cancelled':"+config+".whatsappCancelledSid })["+job+'.eventType]'
voice="'<Response><Say language=\"es-ES\">' + "+job+".text.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</Say></Response>'"
channels=[('SMS','Messages',sid+' && '+phone('smsFrom'),{'From':config+'.smsFrom','To':job+'.recipient','Body':job+'.text'},160),('WhatsApp','Messages',sid+" && /^whatsapp:\\+[1-9]\\d{7,14}$/.test("+config+".whatsappFrom) && /^HX[a-f0-9]{32}$/i.test("+template+')',{'From':config+'.whatsappFrom','To':"'whatsapp:' + "+job+'.recipient','ContentSid':template,'ContentVariables':'JSON.stringify('+job+'.variables)'},420),('llamada','Calls',sid+' && '+phone('voiceFrom'),{'From':config+'.voiceFrom','To':job+'.recipient','Twiml':voice},680)]
for label,resource,check,body,y in channels:
 valid='Configurar '+label;send='Enviar '+label;receipt='Registrar '+label
 condition(valid,check,2200,y)
 node(send,'httpRequest',{'method':'POST','url':"={{ 'https://api.twilio.com/2010-04-01/Accounts/' + "+config+".accountSid + '/"+resource+".json' }}",'authentication':'genericCredentialType','genericAuthType':'httpBasicAuth','sendBody':True,'contentType':'form-urlencoded','bodyParameters':{'parameters':[{'name':k,'value':'={{ '+v+' }}'} for k,v in body.items()]},'options':{'timeout':15000,'response':{'response':{'neverError':True,'fullResponse':True}}}},2420,y,4.2,continueOnFail=True,retryOnFail=False)
 crm(receipt,"'/jobs/' + "+job+".id + '/result'",'{deliveryToken:'+job+".deliveryToken,status:($json.statusCode>=200 && $json.statusCode<300 && $json.body?.sid)?'SENT':'FAILED',providerMessageId:$json.body?.sid || undefined}",2640,y)
 link(valid,send);link(valid,'Registrar fallo',1);link(send,receipt)
link('Cada minuto','Configuracion');link('Configuracion','Recoger trabajos');link('Recoger trabajos','Separar trabajos');link('Separar trabajos','Validar cita');link('Validar cita','Sigue vigente');link('Sigue vigente','Es simulacion');link('Es simulacion','Registrar simulacion');link('Es simulacion','Canal SMS',1)
link('Canal SMS','Configurar SMS');link('Canal SMS','Canal WhatsApp',1);link('Canal WhatsApp','Configurar WhatsApp');link('Canal WhatsApp','Canal llamada',1);link('Canal llamada','Configurar llamada');link('Canal llamada','Registrar fallo',1)
workflow={'name':'NexoCRM - Citas SMS WhatsApp y llamadas','nodes':nodes,'connections':connections,'active':False,'settings':{'executionOrder':'v1','saveDataSuccessExecution':'none','saveDataErrorExecution':'none','saveManualExecutions':False},'pinData':{},'tags':[]}
path=Path(__file__).resolve().parents[1]/'integrations/n8n/nexocrm-notifications.json';path.write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n');print(path)

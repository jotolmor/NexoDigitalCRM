import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const workflow=JSON.parse(readFileSync(resolve(__dirname,'../../../integrations/n8n/nexocrm-notifications.json'),'utf8'));
const node=(name:string)=>workflow.nodes.find((item:any)=>item.name===name);
function evaluate(expression:string,job:any={},result:any={}){
 const configuration=Object.fromEntries(node('Configuracion').parameters.values.string.map((entry:any)=>[entry.name,entry.value]));
 const $=(name:string)=>name==='Configuracion'?{first:()=>({json:configuration})}:{item:{json:job}};
 return new Function('$','$json','return ('+expression.slice(4,-3)+');')($,result);
}
describe('n8n workflow artifact',()=>{
 it('imports inactive, without embedded credentials or saved execution payloads',()=>{
  expect(workflow.active).toBe(false);expect(workflow.settings.saveDataSuccessExecution).toBe('none');expect(workflow.settings.saveDataErrorExecution).toBe('none');
  for(const item of workflow.nodes)expect(item.credentials).toBeUndefined();
 });
 it('contains only valid node references and JavaScript expressions',()=>{
  for(const outputs of Object.values(workflow.connections) as any[])for(const branch of outputs.main)for(const edge of branch)expect(node(edge.node)).toBeDefined();
  function inspect(value:any){if(typeof value==='string'&&value.startsWith('={{ ')&&value.endsWith(' }}'))expect(()=>new Function('$','$json','return ('+value.slice(4,-3)+');')).not.toThrow();else if(Array.isArray(value))value.forEach(inspect);else if(value&&typeof value==='object')Object.values(value).forEach(inspect);}
  inspect(workflow);
 });
 it('takes the simulation branch for every trial channel and rejects unconfigured live provider nodes',()=>{
  for(const channel of ['SMS','WHATSAPP','CALL'])expect(evaluate(node('Es simulacion').parameters.conditions.conditions[0].leftValue,{mode:'DRY_RUN',channel})).toBe(true);
  for(const name of ['Configurar SMS','Configurar WhatsApp','Configurar llamada'])expect(evaluate(node(name).parameters.conditions.conditions[0].leftValue,{mode:'LIVE',eventType:'appointment.reminder'})).toBe(false);
 });
 it('records provider acceptance only on a successful HTTP response, without automatic external retries',()=>{
  for(const channel of ['SMS','WhatsApp','llamada']){
   const receipt=node('Registrar '+channel).parameters.jsonBody;
   expect(JSON.parse(evaluate(receipt,{deliveryToken:'token'},{statusCode:201,body:{sid:'provider-id'}}))).toMatchObject({status:'SENT',providerMessageId:'provider-id'});
   expect(JSON.parse(evaluate(receipt,{deliveryToken:'token'},{statusCode:500,body:{}}))).toEqual({deliveryToken:'token',status:'FAILED'});
   expect(node('Enviar '+channel).retryOnFail).toBe(false);
  }
 });
});

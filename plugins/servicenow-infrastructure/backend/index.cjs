'use strict';
const {createBackendPlugin,coreServices}=require('@backstage/backend-plugin-api');
const express=require('express');
function validateInput(body) {
  if(!body || typeof body.purpose!=='string' || body.purpose.trim().length<5 || body.purpose.length>500) throw Object.assign(Error('Enter a purpose between 5 and 500 characters.'),{status:400});
  if(!['project','virtual_machine'].includes(body.targetKind)||![1,4,8,24].includes(body.hours)) throw Object.assign(Error('Choose a supported environment and lifetime.'),{status:400});
  return {purpose:body.purpose.trim(),targetKind:body.targetKind,hours:body.hours};
}
const plugin=createBackendPlugin({pluginId:'servicenow-infrastructure',register(env){env.registerInit({deps:{httpRouter:coreServices.httpRouter,httpAuth:coreServices.httpAuth,auth:coreServices.auth,userInfo:coreServices.userInfo,discovery:coreServices.discovery,config:coreServices.rootConfig,logger:coreServices.logger},async init({httpRouter,httpAuth,auth,userInfo,discovery,config,logger}){
 const c=config.getConfig('serviceNowInfrastructure'),base=c.getString('bridgeUrl').replace(/\/$/,''),token=c.getString('bridgeToken'),entities=c.getStringArray('entities');
 const router=express.Router();router.use(express.json({limit:'4kb'}));
 async function access(req){
  const credentials=await httpAuth.credentials(req,{allow:['user']}),ref=req.method==='GET'?req.query.entity:req.body.entity;
  if(typeof ref!=='string'||!entities.includes(ref)||!/^component:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(ref))throw Object.assign(Error('Application is not configured.'),{status:403});
  const [,ns,name]=ref.match(/^component:([^/]+)\/(.+)$/),t=await auth.getPluginRequestToken({onBehalfOf:credentials,targetPluginId:'catalog'});
  const r=await fetch(`${await discovery.getBaseUrl('catalog')}/entities/by-name/component/${ns}/${name}`,{headers:{Authorization:`Bearer ${t.token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Object.assign(Error('Application access denied.'),{status:403});
  return {entity:ref,actor:(await userInfo.getUserInfo(credentials)).userEntityRef};
 }
 async function bridge(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(55000)});if(!r.ok)throw Object.assign(Error('Request service is unavailable. Refresh before retrying.'),{status:r.status===409?409:503});return r.json();}
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){logger.warn('ServiceNow request operation failed');res.status(e.status||(e.name==='AuthenticationError'?401:503)).json({error:e.status?e.message:'Request service unavailable.'});}};
 router.get('/requests',wrap(async(req,res)=>{const a=await access(req);res.json(await bridge('/requests?entity='+encodeURIComponent(a.entity)));}));
 router.post('/requests',wrap(async(req,res)=>{const a=await access(req),input=validateInput(req.body);res.status(202).json(await bridge('/start',{...a,...input}));}));
 router.post('/teardown',wrap(async(req,res)=>{const a=await access(req);if(!/^[a-f0-9]{32}$/.test(req.body.id||''))throw Object.assign(Error('Invalid request.'),{status:400});res.json(await bridge('/teardown',{...a,id:req.body.id}));}));
 httpRouter.use(router);
}});}});
module.exports={default:plugin,validateInput};

'use strict';
const {createBackendPlugin,coreServices}=require('@backstage/backend-plugin-api');
const express=require('express');
const states=new Set(['SUCCESS','FAILED','ABORTED','UNSTABLE','IN_PROGRESS','PAUSED_PENDING_INPUT','NOT_EXECUTED','QUEUED']);
function stage(s){if(!s||typeof s.name!=='string'||!states.has(s.status))throw Error('Malformed stage');return {id:String(s.id),name:s.name.slice(0,180),status:s.status,durationMillis:Number.isFinite(s.durationMillis)?Math.max(0,s.durationMillis):0};}
async function json(url,authorization){const r=await fetch(url,{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Jenkins unavailable');const reader=r.body.getReader();let size=0,chunks=[];try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>1000000)throw Error('Oversized response');chunks.push(Buffer.from(x.value));}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
const plugin=createBackendPlugin({pluginId:'ci-progress',register(env){env.registerInit({deps:{httpRouter:coreServices.httpRouter,httpAuth:coreServices.httpAuth,auth:coreServices.auth,discovery:coreServices.discovery,config:coreServices.rootConfig,logger:coreServices.logger},async init({httpRouter,httpAuth,auth,discovery,config,logger}){
 const c=config.getConfig('ciProgress'),base=c.getString('baseUrl').replace(/\/$/,''),publicBase=c.getString('publicUrl').replace(/\/$/,'');
 const bindings=new Map(c.getConfigArray('bindings').map(b=>{const ref=b.getString('entityRef'),job=b.getString('jobFullName');if(!/^component:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(ref)||job.split('/').some(x=>!x||x==='.'||x==='..'||/[?#\\\x00-\x1f]/.test(x)))throw Error('Invalid pipeline binding');return [ref,{job,branch:b.getOptionalString('branch')||job.split('/').at(-1)}];}));
 for(const endpoint of [base,publicBase]){const u=new URL(endpoint);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid Jenkins URL');}
 const authorization='Basic '+Buffer.from(c.getString('username')+':'+c.getString('apiKey')).toString('base64');
 const router=express.Router();router.get(['/progress','/logs'],async(req,res)=>{try{
 const credentials=await httpAuth.credentials(req,{allow:['user']});const ref=req.query.entity,build=req.query.build;const logRequest=req.path==='/logs',stageId=req.query.stage,nodeId=req.query.node;
 const m=typeof ref==='string'&&ref.match(/^component:([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/);
 if((logRequest&&(!build||typeof stageId!=='string'||!/^\d{1,9}$/.test(stageId)||(nodeId!==undefined&&(typeof nodeId!=='string'||!/^\d{1,9}$/.test(nodeId)))))){res.status(400).end();return;}
 if(!m||(build!==undefined&&!/^[1-9][0-9]{0,8}$/.test(String(build)))){res.status(400).end();return;}
 const {token}=await auth.getPluginRequestToken({onBehalfOf:credentials,targetPluginId:'catalog'});
 const cr=await fetch(`${await discovery.getBaseUrl('catalog')}/entities/by-name/component/${m[1]}/${m[2]}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
 if(!cr.ok){res.status(403).json({error:'Application not authorized'});return;}
 const entity=await cr.json(),job=entity.metadata?.annotations?.['jenkins.io/job-full-name'];
 const binding=bindings.get(ref);
 if(!binding||job!==binding.job){res.status(403).json({error:'Pipeline binding not authorized'});return;}
 const path=job.split('/').map(x=>'job/'+encodeURIComponent(x)).join('/');
 const history=await json(`${base}/${path}/api/json?tree=builds[number,result,building,timestamp,duration]{0,10},queueItem[id]`,authorization);
 if(!Array.isArray(history.builds))throw Error('Malformed history');
 const builds=history.builds.slice(0,10).map(b=>({number:b.number,result:b.result,building:b.building}));
 const chosen=build===undefined?builds[0]?.number:Number(build);
 if(chosen===undefined){res.set('Cache-Control','no-store').json({builds,queued:!!history.queueItem,stages:[],empty:true});return;}
 if(!builds.some(b=>b.number===chosen)){res.status(404).json({error:'Build is outside retained history'});return;}
 const meta=await json(`${base}/${path}/${chosen}/api/json?tree=number,result,building,duration,timestamp,actions[lastBuiltRevision[SHA1]]`,authorization);
 const run=await json(`${base}/${path}/${chosen}/wfapi/describe`,authorization);
 if(String(run.id)!==String(chosen)||!Array.isArray(run.stages)||run.stages.length>100)throw Error('Malformed pipeline');
 if(logRequest){
 const selected=run.stages.find(s=>String(s.id)===stageId);if(!selected){res.status(404).json({error:'Stage not found in this build'});return;}
 const detail=await json(`${base}/${path}/${chosen}/execution/node/${stageId}/wfapi/describe`,authorization);
 if(String(detail.id)!==stageId||!Array.isArray(detail.stageFlowNodes)||detail.stageFlowNodes.length>100)throw Error('Malformed stage detail');
 const steps=detail.stageFlowNodes.filter(n=>n._links?.log).map(n=>{if(!/^\d{1,9}$/.test(String(n.id))||typeof n.name!=='string')throw Error('Malformed node');return {id:String(n.id),name:n.name.slice(0,180)};});
 const node=nodeId||steps[0]?.id;if(node&&!steps.some(s=>s.id===node)){res.status(404).json({error:'Log step not found in this stage'});return;}
 let text='',truncated=false;
 if(node){const log=await json(`${base}/${path}/${chosen}/execution/node/${node}/wfapi/log`,authorization);if(String(log.nodeId)!==node||typeof log.text!=='string')throw Error('Malformed log');text=log.text;truncated=!!log.hasMore||text.length>65536;text=text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');for(const secret of [c.getString('apiKey'),authorization])if(secret)text=text.split(secret).join('[REDACTED]');text=text.slice(0,65536);}
 res.set('Cache-Control','no-store').json({number:chosen,stage:stageId,stageName:selected.name,steps,node:node||null,text,truncated,jenkinsUrl:`${publicBase}/${path}/${chosen}/console`,observedAt:new Date().toISOString()});return;
 }
 const commit=meta.actions?.map(a=>a.lastBuiltRevision?.SHA1).find(x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x));
 res.set('Cache-Control','no-store').json({builds,number:chosen,branch:binding.branch,commit:commit||null,building:!!meta.building,queued:!!history.queueItem,status:meta.building?'IN_PROGRESS':meta.result||'UNKNOWN',durationMillis:meta.building?Math.max(0,Date.now()-meta.timestamp):meta.duration,stages:run.stages.map(stage),jenkinsUrl:`${publicBase}/${path}/${chosen}/`,observedAt:new Date().toISOString()});
 }catch(e){logger.warn('Pipeline progress unavailable');res.status(e.name==='AuthenticationError'?401:503).json({error:'Pipeline progress unavailable. No successful result is implied.'});}});httpRouter.use(router);
 }});}});module.exports={default:plugin,stage};

#!/usr/bin/env python3
"""Configure catalog-specific PDI approval rules; prompt for the setup credential."""
import argparse,getpass,json,re,urllib.request
from pathlib import Path
from prepare_catalog import Client

def patch(client, table, ident, body):
    if not re.fullmatch('[a-f0-9]{32}',ident): raise ValueError('Invalid ID')
    req=urllib.request.Request(client.url+'/api/now/table/'+table+'/'+ident,method='PATCH',data=json.dumps(body).encode(),headers={'Authorization':client.auth,'Content-Type':'application/json','Accept':'application/json'})
    with client.opener.open(req,timeout=45) as r:return json.load(r)['result']

def configure(c,item,approver):
    rows=c.call('sc_cat_item',query='sys_id='+item,fields='name,sys_id')
    if len(rows)!=1 or rows[0]['name']!='RHDH OpenShift Infrastructure Request':raise ValueError('Unexpected item')
    users=c.call('sys_user',query='user_name='+approver,fields='sys_id')
    if len(users)!=1:raise ValueError('Approver not found')
    root=Path(__file__).parent/'tenant'
    rules=[('RHDH infrastructure approval','sc_req_item','request-approval.js',True,False,'current.cat_item.toString() == "'+item+'"'),('RHDH infrastructure approval decision','sysapproval_approver','approval-decision.js',False,True,'current.state.changes()')]
    rules.append(('RHDH infrastructure approval guard','sc_req_item','approval-guard.js',True,True,'current.cat_item.toString() == "'+item+'"'))
    result=[]
    for name,table,file,insert,update,condition in rules:
        script=(root/file).read_text().replace('__APPROVER__',users[0]['sys_id']).replace('__ITEM__',item)
        body={'name':name,'collection':table,'when':'before' if file == 'approval-guard.js' else 'after','order':100,'active':True,'action_insert':insert,'action_update':update,'action_delete':False,'advanced':True,'condition':condition,'script':script}
        old=c.call('sys_script',query='name='+name,fields='sys_id,collection')
        if len(old)>1:raise ValueError('Duplicate rule')
        if old:
            if old[0]['collection']!=table:raise ValueError('Rule conflict')
            r=patch(c,'sys_script',old[0]['sys_id'],body)
        else:r=c.call('sys_script',body=body)
        result.append({'name':name,'sys_id':r['sys_id']})
    # Clear generic fulfillment flows for this selected item; our approval is explicit.
    patch(c,'sc_cat_item',item,{'workflow':'','flow_designer_flow':'','active':True})
    return result

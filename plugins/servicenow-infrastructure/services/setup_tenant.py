#!/usr/bin/env python3
"""Configure the selected inactive catalog item and its approval rules."""
import argparse,getpass,json,re
from pathlib import Path
from prepare_catalog import Client,prepare
from configure_tenant import configure

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--url',required=True);p.add_argument('--username',default='admin')
 p.add_argument('--item-id',required=True);p.add_argument('--approver',required=True)
 a=p.parse_args()
 if not re.fullmatch('[a-f0-9]{32}',a.item_id):p.error('Use the catalog item sys_id')
 if not re.fullmatch('[A-Za-z0-9_.@-]+',a.approver):p.error('Use an approver username')
 c=Client(a.url,a.username,getpass.getpass('ServiceNow setup password: '))
 spec=json.loads(Path(__file__).with_name('catalog-item.json').read_text())
 prepare(c,a.item_id,spec)
 configure(c,a.item_id,a.approver)
 user=c.call('sys_user',query='user_name='+a.approver,fields='sys_id')
 print('Catalog item enabled with approval rules.')
 print('Item sys_id: '+a.item_id)
 print('Approver sys_id: '+user[0]['sys_id'])
if __name__=='__main__':main()

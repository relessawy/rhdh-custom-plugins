import {test} from "node:test";
import assert from "node:assert/strict";
import {argoCard} from "../src/argocd";
test("Argo reports sync and runtime health separately",()=>{
 const card=argoCard({metadata:{name:"app"},status:{sync:{status:"Synced",revision:"1234567890123456"},health:{status:"Degraded"},resources:[{}]}},"/cd");
 assert.equal(card.status,"Synced · Degraded"); assert.ok(card.bullets?.includes("Managed resources: 1")); assert.equal(card.href,"/cd");
 assert.equal(argoCard({metadata:{name:"app"},status:{}}).status,"Unknown · Unknown");
 assert.throws(()=>argoCard({}));
});

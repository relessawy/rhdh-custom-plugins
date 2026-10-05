import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sonarCard } from '../src/sonarqube';
test('SonarQube distinguishes passed, failed and missing gates',()=>{
 assert.equal(sonarCard({measures:[{metric:'alert_status',value:'OK'},{metric:'coverage',value:'0'}]}).status,'Quality gate · PASSED');
 assert.deepEqual(sonarCard({measures:[{metric:'coverage',value:'0'}]}).bullets,['Coverage: 0%']);
 assert.equal(sonarCard({measures:[{metric:'alert_status',value:'ERROR'}]}).status,'Quality gate · FAILED');
 assert.equal(sonarCard({measures:[]}).status,'Quality gate · Unknown');
 assert.throws(()=>sonarCard(null));
});

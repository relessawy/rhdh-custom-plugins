import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pagerDutyCard} from '../src/pagerduty';

test('PagerDuty counts open states, excludes resolved and deduplicates responders', () => {
  const c = pagerDutyCard({id:'S1',name:'Example'}, [{status:'triggered'},{status:'acknowledged'},{status:'resolved'}], [{name:'Alice'},{name:'Alice'}], '/pagerduty');
  assert.equal(c.status, '2 open incidents');
  assert.ok(c.bullets?.includes('Triggered: 1'));
  assert.ok(c.bullets?.includes('Acknowledged: 1'));
  assert.ok(c.bullets?.includes('On call: Alice'));
  assert.equal(c.href, '/pagerduty');
});
test('PagerDuty does not report missing or unknown data as zero incidents', () => {
  assert.throws(() => pagerDutyCard({id:'S1'}, undefined, []));
  assert.throws(() => pagerDutyCard({id:'S1'}, [{status:'unexpected'}], []));
  const c = pagerDutyCard({id:'S1'}, [], []);
  assert.equal(c.status, 'No open incidents returned');
  assert.match(c.detail, /30 days/);
});

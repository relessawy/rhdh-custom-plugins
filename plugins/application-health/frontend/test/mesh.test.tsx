import test from 'node:test';
import assert from 'node:assert/strict';
import {meshCard} from '../src/mesh';
import {configuredCards} from '../src/Overview';
test('mesh is optional and requires an entity namespace', () => {
  assert.deepEqual(configuredCards({'kiali.io/namespace':'sample'}, []), []);
  assert.deepEqual(configuredCards({}, ['mesh']), []);
  assert.deepEqual(configuredCards({'kiali.io/namespace':'sample'}, ['mesh']), ['mesh']);
});
test('counts only observed sidecars without claiming workload health', () => {
  const c=meshCard('sample',{workloads:[{istioSidecar:true},{istioSidecar:false}]},{autoMTLSEnabled:true,status:'UNSET'});
  assert.equal(c.status,'1 meshed workloads');
  assert.ok(c.bullets?.includes('TLS policy: UNSET'));
});
test('invalid or unavailable results cannot become a healthy card', () => {
  assert.throws(()=>meshCard('sample',{verify:false},{}));
  assert.throws(()=>meshCard('sample',{workloads:[]},{}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {interpolateUdr,calculateFuelNorm} from '../fuel.js';

test('interpolates the original axle-load table',()=>{
  assert.equal(interpolateUdr('cargo',110,10,{col5:10,col6:8}),8);
  assert.equal(interpolateUdr('cargo',55,10,{col5:10,col6:8}),9);
});
test('calculates freight traction, starting and idling from the selected catalog row',()=>{
  const data={haul:[{_id:1,length_of_haul:100}],loco:[{_id:2,sections:2}],udr_cargo:[{haul_id:1,loco_id:2,col5:10,col6:8,idle:3,gateaway:.002}]};
  const result=calculateFuelNorm({haulId:1,locoId:2,weight:55,axles:10,stops:2,idleMinutes:60,trafficType:'cargo'},data);
  assert.equal(result.udr,9);
  assert.equal(result.norm,11);
});

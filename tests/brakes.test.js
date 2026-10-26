import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBrakes} from '../brakes.js';

test('brake certificate reproduces pressure, axle and slope calculations',()=>{
  const value=calculateBrakes({weight:4000,pressurePer100:33,gradient:18,axles_6:100,axles_5_5:50});
  assert.equal(value.totalAxles,150);
  assert.equal(value.actualPressing,875);
  assert.equal(value.actualPer100,21.9);
  assert.equal(value.requiredPressing,1320);
  assert.equal(value.handbrakes,64);
  assert.equal(value.shoes,24);
});

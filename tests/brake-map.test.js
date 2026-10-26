import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brakesForDirection} from '../brake-map.js';

const map=JSON.parse(readFileSync(new URL('../data/skorostya-map.json',import.meta.url),'utf8'));
const brakes=map.routes['kor-vih'].brakes;

test('Пробы тормозов зависят от направления и категории, а не от пути',()=>{
  const freightEven=brakesForDirection(brakes,true,'freight');
  const passengerEven=brakesForDirection(brakes,true,'passenger');
  const freightOdd=brakesForDirection(brakes,false,'freight');
  assert(freightEven.some(b=>b.km===278&&b.picket===8));
  assert(passengerEven.some(b=>b.km===276&&b.picket===3));
  assert(freightOdd.some(b=>b.km===274&&b.picket===5));
  assert(freightEven.every(b=>b.direction==='even'&&b.train_kind==='freight'));
  assert(freightOdd.every(b=>b.direction==='odd'&&b.train_kind==='freight'));
});

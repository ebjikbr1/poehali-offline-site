import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSpeedSegments} from '../speed-map.js';
import {sourceGeometry,sourceSpeeds,sourceCoordinateSpeeds} from '../source-map.js';

test('overlaps yield one restrictive speed and internal gaps are filled',()=>{
  const segments=resolveSpeedSegments([
    {from:0,to:1000,speed:80,kind:'plan'},
    {from:200,to:400,speed:70,kind:'plan'},
    {from:1200,to:2000,speed:80,kind:'plan'}
  ]);
  assert.deepEqual(segments.map(({from,to,speed})=>[from,to,speed]),[
    [0,200,80],[200,400,70],[400,2000,80]
  ]);
});

test('all imported train categories and tracks have a continuous, single speed',()=>{
  const map=JSON.parse(readFileSync(new URL('../data/skorostya-map.json',import.meta.url),'utf8'));
  let count=0;
  for(const [routeId,route] of Object.entries(map.routes))for(const [track,categories] of Object.entries(route.tracks))for(const [category,page] of Object.entries(categories)){
    const key=`${routeId}:${track}:${category}`,geometry=sourceGeometry(page),resolved=sourceSpeeds(geometry,[],routeId,track,resolveSpeedSegments);
    assert.ok(geometry.length>0,key);
    assert.equal(resolved[0].from,0,key);
    assert.equal(resolved.at(-1).to,geometry.length,key);
    for(let i=1;i<resolved.length;i++)assert.equal(resolved[i-1].to,resolved[i].from,key);
    for(const group of geometry.groups){
      const start=geometry.locate(group.start),end=geometry.locate(group.end);
      assert.ok(start!=null&&end!=null,key);
      assert.equal(Math.abs(start-end),group.worldEnd-group.worldStart,key);
    }
    count++;
  }
  assert.equal(count,56);
});

test('the original profile remains and train categories change only the speed band',()=>{
  const profile=JSON.parse(readFileSync(new URL('../data/phone-map.json',import.meta.url),'utf8'));
  assert.ok(profile.profiles.length>7000);
  assert.ok(profile.geo.length>0);
  assert.ok(profile.objects.some(item=>item.type===1));
  const source=JSON.parse(readFileSync(new URL('../data/skorostya-map.json',import.meta.url),'utf8'));
  const tracks=source.routes['kor-vih'].tracks['2'];
  const freight=sourceCoordinateSpeeds(tracks.freight,[],'kor-vih',2,resolveSpeedSegments);
  const heavy=sourceCoordinateSpeeds(tracks['18-100'],[],'kor-vih',2,resolveSpeedSegments);
  const at=292300,speed=segments=>segments.find(s=>s.from<=at&&at<s.to)?.speed;
  assert.equal(speed(freight),80);
  assert.equal(speed(heavy),70);
});

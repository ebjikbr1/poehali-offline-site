import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('после потери сигнала GPS повторно ищет координаты и центрирует поезд',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf('function clearGPSTimers()');
  const end=app.indexOf('function navigate(target)',start);
  assert(start>0&&end>start);
  const watches=[],timers=[];
  const context={
    gpsRetryTimer:null,gpsWatchdogTimer:null,gpsRetryAttempts:0,lastGpsFixAt:0,gpsGeneration:0,
    watchId:null,lastPosition:null,gpsStatus:'off',gpsMessage:'',viewKm:10,followTrain:false,screen:'tracker',
    state:{tracker:{gps:false,km:278,speed:60}},window:{isSecureContext:true},
    navigator:{geolocation:{watchPosition(success,error){watches.push({success,error});return watches.length;},clearWatch(){}}},
    document:{addEventListener(){}},armSpeedAlertAudio(){},drawTracker(){},save(){},
    gpsUpdate(){context.gpsStatus='fixed';return true;},coordinateLabel(){return '279 км 1 пк';},
    setTimeout(callback,delay){const timer={callback,delay};timers.push(timer);return timer;},clearTimeout(){},
    Date,
  };
  vm.createContext(context);
  vm.runInContext(`${app.slice(start,end)}\nstartGPS(true);`,context);
  assert.equal(watches.length,1);
  watches[0].error({code:2});
  assert.equal(context.gpsStatus,'searching');
  assert.equal(timers.at(-1).delay,5000);
  timers.at(-1).callback();
  assert.equal(watches.length,2);
  watches[1].success({coords:{latitude:0,longitude:0}});
  assert.equal(context.viewKm,null);
  assert.equal(context.followTrain,true);
  assert.match(context.gpsMessage,/Координаты проверены/);
});

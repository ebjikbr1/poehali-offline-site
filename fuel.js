// Port of the core fuel formulas in TrainNote 0.6.9 Calculation.java.
const cargoGrid = Array.from({length:21},(_,i)=>i+5);
const passengerGrid = Array.from({length:22},(_,i)=>(i+1)*60);
const n = value => Number(value||0);
const round = (value, digits=2) => Number(value.toFixed(digits));

export function interpolateUdr(type, weight, axles, row){
  if(!row)return null;
  const passenger=type==='passenger';
  const grid=passenger?passengerGrid:cargoGrid;
  const values=grid.map((_,i)=>n(row[`col${i+5}`])).filter(v=>v!==0);
  if(!values.length)return null;
  const load=passenger?n(weight):n(weight)/n(axles);
  if(!Number.isFinite(load))return null;
  if(load<=grid[0])return values[0];
  if(load>=grid[values.length-1])return values.at(-1);
  const i=grid.findIndex((g,j)=>j<values.length-1 && load>=g && load<=grid[j+1]);
  if(i<0)return null;
  const t=(load-grid[i])/(grid[i+1]-grid[i]);
  return values[i]+(values[i+1]-values[i])*t;
}

export function calculateFuelNorm(input,catalog){
  const type=input.trafficType||'cargo';
  const haul=(catalog.haul||[]).find(x=>String(x._id)===String(input.haulId));
  const loco=(catalog.loco||[]).find(x=>String(x._id)===String(input.locoId));
  if(!haul||!loco)return {error:'Выберите участок и локомотив'};
  const weight=n(input.weight),axles=n(input.axles),length=n(input.distance)||n(haul.length_of_haul);
  const headSections=n(input.headSections)||n(loco.sections)||1;
  const idleMinutes=n(input.idleMinutes),stops=n(input.stops),pusherStops=n(input.pusherStops);
  const pusherLength=n(input.pusherLength),pusherSections=n(input.pusherSections);
  if(length<=0)return {error:'Неизвестна длина участка'};
  if(type==='reserve'){
    const row=(catalog.udr_reserve||[]).find(x=>String(x.haul_id)===String(input.haulId)&&String(x.line)===String(input.locoId));
    if(!row)return {error:'Для выбранного участка нет нормы резерва'};
    const rate=n(row.udr_res),idle=round(idleMinutes/60*n(input.idleRate),0);
    return {norm:round(length/100*rate+idle,2),udr:rate,components:{traction:round(length/100*rate,2),idle}};
  }
  if(weight<=0 || (type!=='passenger' && axles<=0))return {error:'Укажите массу и число осей'};
  const tableName=type==='passenger'?'udr_pass':type==='work'?'udr_work':'udr_cargo';
  const row=(catalog[tableName]||[]).find(x=>String(x.haul_id)===String(input.haulId)&&String(x.loco_id)===String(input.locoId));
  if(!row)return {error:'Для выбранного участка и локомотива нет нормы'};
  const udr=n(input.manualUdr)||interpolateUdr(type,weight,axles,row);
  if(udr==null)return {error:'Невозможно определить удельный расход'};
  const idleRate=n(input.idleRate)||n(row.idle);
  const getawayRate=n(input.getawayRate)||n(row.gateaway);
  const idle=round(idleMinutes/60*idleRate*headSections,2);
  const getaway=(stops-pusherStops/2)*weight*getawayRate;
  const extraPusher=pusherLength>0&&pusherSections>0
    ? (headSections===pusherSections?weight/2:weight*headSections/(headSections+pusherSections))*pusherLength*udr/10000
    : 0;
  const nagon=type==='passenger'?n(input.nagon)*4:0;
  const traction=weight*(length-pusherLength)*udr/10000;
  const norm=round(traction+idle+getaway+extraPusher+nagon,type==='passenger'?2:0);
  return {norm,udr:round(udr,3),components:{traction:round(traction,2),idle,getaway:round(getaway,2),extraPusher:round(extraPusher,2),nagon}};
}

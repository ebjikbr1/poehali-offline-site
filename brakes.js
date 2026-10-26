// Formulas and lookup values from TrainNote 0.6.9 SpravkaActivity.
export const gradients=[0,2,4,6,8,10,12,14,16,18,20,22,24,26,30,32,34,36,38,40];
export const axlePressures=[1.25,3,3.5,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,10,11,11.5,12,13,14,15,16,18,19,21];
const handbrakes=[.4,.4,.4,.4,.6,.8,1,1.2,1.4,1.6,1.8,0,0,0,0,0,0,0,0,0];
const shoes=[.2,.2,.2,.2,.2,.3,.4,.4,.5,.6,.6,.7,.8,.8,.9,1,1,1.1,1.2,1.2];
const round=(x,d=0)=>Number(x.toFixed(d));

export function calculateBrakes(input){
  const weight=Number(input.weight)||0;
  const neededPer100=Number(input.pressurePer100)||0;
  const gradientIndex=Math.max(0,gradients.indexOf(Number(input.gradient)));
  const rows=axlePressures.map(pressure=>{
    const axles=Math.max(0,Number(input[`axles_${String(pressure).replace('.','_')}`])||0);
    return {pressure,axles,pressing:round(pressure*axles)};
  });
  const totalAxles=rows.reduce((sum,row)=>sum+row.axles,0);
  const actualPressing=rows.reduce((sum,row)=>sum+row.pressure*row.axles,0);
  return {
    rows,totalAxles,actualPressing:round(actualPressing),
    actualPer100:weight>0?round(actualPressing/weight*100,1):null,
    requiredPressing:weight>0?round(weight/100*neededPer100):null,
    handbrakes:weight>0?round(weight/100*handbrakes[gradientIndex]):null,
    handbrakesExact:weight>0?round(weight/100*handbrakes[gradientIndex],1):null,
    shoes:weight>0?round(weight/100*shoes[gradientIndex]):null
  };
}

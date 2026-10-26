// Build one effective speed for every coordinate interval on a track.
export function resolveSpeedSegments(intervals,fillGaps=true) {
  const source=intervals.filter(item=>Number.isFinite(item.from)&&Number.isFinite(item.to)&&item.to>item.from&&Number.isFinite(item.speed)&&item.speed>=0);
  if(!source.length)return [];
  const edges=[...new Set(source.flatMap(item=>[item.from,item.to]))].sort((a,b)=>a-b);
  const pieces=[];
  for(let i=0;i<edges.length-1;i++){
    const from=edges[i],to=edges[i+1],mid=(from+to)/2;
    let chosen=source.filter(item=>item.from<=mid&&mid<item.to)
      .sort((a,b)=>a.speed-b.speed||Number(a.kind==='warning')-Number(b.kind==='warning'))[0];
    let inferred=false;
    if(!chosen&&fillGaps){
      const before=source.filter(item=>item.to<=from).sort((a,b)=>b.to-a.to)[0];
      const after=source.filter(item=>item.from>=to).sort((a,b)=>a.from-b.from)[0];
      if(!before||!after)continue;
      // The source leaves this interval empty. Use the more restrictive neighbour.
      chosen=before.speed<=after.speed?before:after;
      inferred=true;
    }
    if(!chosen)continue;
    inferred ||= !!chosen.inferred;
    const kind=inferred?'inferred':chosen.kind;
    const last=pieces.at(-1);
    if(last&&last.to===from&&last.speed===chosen.speed&&(last.kind==='warning')===(kind==='warning')){
      last.to=to;last.inferred ||= inferred;
      if(last.kind!=='warning')last.kind=last.inferred?'inferred':'plan';
      continue;
    }
    pieces.push({from,to,speed:chosen.speed,kind,inferred});
  }
  return pieces;
}

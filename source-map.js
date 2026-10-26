// Kilometer/picket route geometry imported from skorostya-2. World coordinates
// are cumulative meters so a kilometer reset never tears the drawn route.
export function sourcePage(source, routeId, track, category) {
  return source?.routes?.[routeId]?.tracks?.[String(track)]?.[category] || null;
}

export function sourceGeometry(page) {
  if (!page) return null;
  let distance = 0;
  const groups = page.groups.map(group => {
    const length = Math.max(100, Math.abs(group.end - group.start));
    const item = {...group, worldStart: distance, worldEnd: distance + length};
    distance += length;
    return item;
  });
  const reverse = page.direction.order === 'reverse';
  const toTravel = world => reverse ? distance - world : world;
  const locate = coordinate => {
    const group = groups.find(g => Math.min(g.start,g.end) <= coordinate && coordinate <= Math.max(g.start,g.end));
    if (!group) return null;
    const ratio = group.end === group.start ? 0 : (coordinate - group.start) / (group.end - group.start);
    return toTravel(group.worldStart + ratio * (group.worldEnd - group.worldStart));
  };
  const coordinateAt = travel => {
    const world = reverse ? distance - travel : travel;
    const group = groups.find(g => g.worldStart <= world && world <= g.worldEnd) || groups.at(-1);
    if (!group) return null;
    const ratio = Math.max(0,Math.min(1,(world - group.worldStart)/(group.worldEnd-group.worldStart)));
    return group.start + ratio*(group.end-group.start);
  };
  return {groups, length: distance, reverse, toTravel, locate, coordinateAt};
}

export function sourceSpeeds(geometry, warnings, routeId, track, resolveSpeedSegments) {
  if (!geometry) return [];
  const raw=[];
  for (const group of geometry.groups) {
    const a=geometry.toTravel(group.worldStart),b=geometry.toTravel(group.worldEnd);
    raw.push({from:Math.min(a,b),to:Math.max(a,b),speed:group.speed,kind:'plan'});
    for(const row of group.rows){
      if(row.from==null||row.to==null||!row.speeds.length)continue;
      const denom=group.end-group.start;
      if(!denom)continue;
      const at=coord=>geometry.toTravel(group.worldStart+Math.max(0,Math.min(1,(coord-group.start)/denom))*(group.worldEnd-group.worldStart));
      const r1=at(row.from),r2=at(row.to);
      if(Math.abs(r2-r1)<1)continue;
      raw.push({from:Math.min(r1,r2),to:Math.max(r1,r2),speed:Math.min(...row.speeds),kind:'plan'});
    }
  }
  for(const warning of warnings){
    if(warning.route!=null&&warning.route!==routeId||Number(warning.way)!==Number(track))continue;
    const a=geometry.locate(warning.from*1000),b=geometry.locate(warning.to*1000);
    if(a==null||b==null||Math.abs(a-b)<1)continue;
    raw.push({from:Math.min(a,b),to:Math.max(a,b),speed:Number(warning.speed),kind:'warning'});
  }
  return resolveSpeedSegments(raw,false).map(item=>({...item,key:`source:${routeId}:${track}:${item.from}:${item.to}:${item.speed}:${item.kind}`}));
}

// Return speeds in the kilometer coordinates used by the original profile.
// The source route is selected separately so parallel branches never overlap.
export function sourceCoordinateSpeeds(page, warnings, routeId, track, resolveSpeedSegments) {
  if(!page)return [];
  const raw=[];
  for(const group of page.groups){
    raw.push({from:Math.min(group.start,group.end),to:Math.max(group.start,group.end),speed:group.speed,kind:'plan'});
    for(const row of group.rows){
      if(row.from==null||row.to==null||!row.speeds.length)continue;
      const from=Math.max(Math.min(group.start,group.end),Math.min(row.from,row.to));
      const to=Math.min(Math.max(group.start,group.end),Math.max(row.from,row.to));
      if(to>from)raw.push({from,to,speed:Math.min(...row.speeds),kind:'plan'});
    }
  }
  for(const warning of warnings){
    if(warning.route!=null&&warning.route!==routeId||Number(warning.way)!==Number(track))continue;
    raw.push({from:Math.min(warning.from,warning.to)*1000,to:Math.max(warning.from,warning.to)*1000,speed:Number(warning.speed),kind:'warning'});
  }
  return resolveSpeedSegments(raw,false).map(item=>({...item,key:`source:${routeId}:${track}:${item.from}:${item.to}:${item.speed}:${item.kind}`}));
}

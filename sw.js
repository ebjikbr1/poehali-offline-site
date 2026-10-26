const CACHE='trainnote-html-v10';
const catalogs=['branches','depots','haul','loco','station','station_on_haul','traffic_type','udr_cargo','udr_pass','udr_reserve','udr_work'];
const images=['calc.png','calc0.png','chara.webp','gruz.png','ic_history_grey.png','komsomolsk.webp','nagon_pass.png','oborot.png','plus_but.png','Plus_button.png','prostoi_gruz.png','ruzhino.webp','save.png','train_card.png','troganie_gruz_tyazh.png','troganie_gruz.png','troganie_pass.png','ud_gruz_tyazh.png','ud_gruz.png','ud_pass.png','ud_tolkach.png','urgal.webp'];
const files=['./','index.html','poehali.html','poehali-source.html','app.js','source-map.js','brake-map.js','speed-map.js','styles.css','fuel.js','brakes.js','manifest.webmanifest','poehali.webmanifest','icon.svg','icon-192.png','icon-512.png','data/profile.json','data/waypoints.json','data/phone-map.json','data/skorostya-map.json','source-assets/danger.wav','source-assets/assets/help_main.html','source-assets/assets/help_manual.html','source-assets/assets/help_trains.html','source-assets/assets/help.js','source-assets/assets/style.css',...catalogs.map(name=>`data/catalog/${name}.json`),...images.map(name=>`source-assets/assets/images/${name}`)];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});

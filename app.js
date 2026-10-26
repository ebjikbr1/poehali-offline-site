import {calculateFuelNorm} from './fuel.js';
import {calculateBrakes,gradients,axlePressures} from './brakes.js';
import {resolveSpeedSegments} from './speed-map.js';
import {sourcePage,sourceCoordinateSpeeds} from './source-map.js';
import {brakesForDirection} from './brake-map.js';
const STORAGE_KEY = 'trainnote-html-v1';
let storedState = null;
try { storedState = localStorage.getItem(STORAGE_KEY); } catch {}
const hadSaved = storedState !== null;
const initial = {
  days: [], limits: [], stations: [],
  tracker: { km: 0, sector: 0, way: 1, even: true, scale: 1, offset: 0, trainLength: 1000, trainLengthUnit: 'm', locoLength: 51, speed: null, speedPrecise: false, gps: false, satellites: null, lengthMode: 0, coordinateSimple: true, stopwatch: {running:false,startedAt:0,elapsed:0} },
  settings: { hourlyRate: 0, regionFactor: 0, northernFactor: 0, classBonus: 0, zoneBonus: 0, bamBonus: 0, tripExpenses: 0, restrictOveruse: false, fiveDayNorm: false, defaultSections: 3, counterDigits: 8, defaultGradient: 18, defaultPressure: 33, stationRecording: false, alertBefore: 800, alertSpeedChanges: true, showMapCoordinates: false }
};
const clone = value => JSON.parse(JSON.stringify(value));
let state;
try { state = { ...clone(initial), ...JSON.parse(storedState || '{}') }; }
catch { state = clone(initial); }
state.tracker = { ...initial.tracker, ...state.tracker };
state.tracker.route ||= 'kor-vih';
state.tracker.trainCategory ||= 'freight';
let storedTracker=null;
try { storedTracker=JSON.parse(storedState||'{}').tracker; } catch {}
if(storedTracker?.trainLength!=null&&storedTracker.trainLengthUnit!=='m'){
  state.tracker.trainLength=Number(state.tracker.trainLength)===71?1000:Math.round(Number(state.tracker.trainLength||0)*14);
  state.tracker.trainLengthUnit='m';
}
state.tracker.stopwatch={...initial.tracker.stopwatch,...state.tracker.stopwatch};
state.tracker.gps=false;
state.settings = { ...initial.settings, ...state.settings };
state.days ||= []; state.limits ||= []; state.stations ||= [];
state.calculator ||= {}; state.brakes ||= {};
let screen = document.body.dataset.start==='tracker'?'tracker':'home', drawer = false, modal = null, listMode = null, settingsPage='', settingsReturn='home';
let viewKm=null,followTrain=true;
let profile = [], waypoints = [], mapObjects = [], phoneMap = false, catalog = {}, watchId = null, lastPosition = null;
let sourceMap = null;
let gpsStatus = 'off', gpsMessage = '';
let pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pwaInstallPrompt = event; });
window.addEventListener('appinstalled', () => { pwaInstallPrompt = null; });
const speedSegmentCache=new Map();
const approachedSpeedChanges = new Set(), enteredSpeedChanges = new Set();
let speedFlash = null, speedAlertAudio = null;
const app = document.getElementById('app');
const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number(value || 0);
const coordinateLabel = value => {const meters=Math.round(num(value)*1000);return `${Math.floor(meters/1000)+1} км ${Math.floor((meters%1000)/100)+1} пк`};
const coordinateParts = value => {const pickets=Math.floor(num(value)*10+1e-6);return {km:Math.floor(pickets/10)+1,pk:pickets%10+1}};
const speedBandHeight = (speed,height) => Math.max(5,Math.min(height*.35,(100-num(speed))*height*.0054));
const speedFlashOn = key => speedFlash?.key===key && performance.now()-speedFlash.startedAt<speedFlash.count*500 && Math.floor((performance.now()-speedFlash.startedAt)/250)%2===0;
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const today = () => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const localDatetime = (at=Date.now()) => { const d=new Date(at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const money = value => Number.isFinite(value) ? value.toFixed(2).replace('.',',') : '0,00';
const fmtTime = time => { const n=Math.max(0,Math.round(time)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
const minutes = (a,b) => {if(!a||!b)return 0;const value=Math.round((new Date(b)-new Date(a))/60000);return Number.isFinite(value)?Math.max(0,value):0;};
const dateObj = value => new Date(`${value}T12:00:00`);
const dateTitle = value => new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(dateObj(value));
const dayLabel = value => new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(dateObj(value));
const timeOnly = value => value ? new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';
const optionField = (label,name,items,value='') => `<label class="field"><span>${label}</span><select name="${name}"><option value="">Выберите</option>${items.map(([id,title])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;

function header(title, actions='') { return `<div class="topbar"><button data-action="${screen==='home'?'drawer':screen==='list'?'list-back':screen==='settings'&&settingsPage?'settings-back':'home'}" aria-label="Назад или меню">${screen==='home'?'☰':'‹'}</button><div class="title">${esc(title)}</div>${actions}</div>`; }
function drawHome() {
  const sorted=[...state.days].sort((a,b)=>b.date.localeCompare(a.date));
  const groups=new Map(); sorted.forEach(d=>{const k=d.date.slice(0,7);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d)});
  let content=''; let i=0;
  for(const [month,days] of groups){
    const total=days.reduce((s,d)=>s+minutes(d.signOn,d.signOff),0);
    const bg=['chara.webp','komsomolsk.webp','ruzhino.webp','urgal.webp'][i++%4];
    content+=`<div class="month-photo" style="background-image:linear-gradient(#0002,#0003),url('source-assets/assets/images/${bg}')">${esc(dateTitle(days[0].date))} – ${fmtTime(total)} / ${esc(days[0].norm||0)}</div>`;
    for(const d of days){ const work=minutes(d.signOn,d.signOff);const trains=d.trains||[];
      const energy=trains.reduce((s,t)=>s+num(t.energyFact),0);
      content+=`<div class="day-card" data-action="day" data-id="${esc(d.id)}"><div class="day-num">${Number(d.date.slice(-2))}<small>${esc(dayLabel(d.date))}</small></div><div class="day-body"><b>${trains.length ? `${trains.length} поезд(ов)`:'Нет поездов'}</b><div class="stat-row"><span>Рабочее время:</span><span>${timeOnly(d.signOn)} – ${timeOnly(d.signOff)}</span></div><div class="stat-row"><span>Отработано часов:</span><span>${fmtTime(work)}</span></div><div class="stat-row"><span>Электроэнергия расход:</span><span>${energy}</span></div><div class="stat-row"><span>Деньги:</span><span>${money(work/60*num(state.settings.hourlyRate))}</span></div></div></div>`;
    }
  }
  app.innerHTML=`${header('Блокнот машиниста', '<span class="small-title">Норма на сегодня: '+esc(new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date()))+'</span><button data-action="search" aria-label="Поиск">⌕</button>')}<div class="tabs"><button class="active" data-action="home">По дням</button><button data-action="months">По месяцам</button></div><main class="paper">${content||'<div class="empty">Нет записей. Нажмите +, чтобы добавить рабочий день.</div>'}</main><button class="fab" data-action="new-day" aria-label="Добавить">+</button>${drawer ? drawDrawer():''}${modal?drawModal():''}`;
}
function drawMonths(){
  const months=new Map();for(const d of state.days){const k=d.date.slice(0,7);months.set(k,(months.get(k)||0)+minutes(d.signOn,d.signOff))}
  app.innerHTML=`${header('Блокнот машиниста')}<div class="tabs"><button data-action="home">По дням</button><button class="active" data-action="months">По месяцам</button></div><main class="screen-page">${[...months].sort((a,b)=>b[0].localeCompare(a[0])).map(([m,v])=>`<div class="card"><h2>${esc(dateTitle(m+'-01'))}</h2>Отработано: ${fmtTime(v)}</div>`).join('')||'<div class="empty">Пока нет записей</div>'}</main>${drawer?drawDrawer():''}`;
}
function drawDrawer(){return `<div class="drawer-shade" data-action="close-drawer"><nav class="drawer"><div class="drawer-head" style="background-image:linear-gradient(#0002,#0007),url('source-assets/assets/images/chara.webp')"><div><b>Восточно-Сибирская</b><br>ТЧЭ-14 Новая Чара</div></div><button data-action="home">▣　Поездки</button><button data-action="calculator">ϟ　Расчёт электроэнергии</button><button data-action="brakes">▤　Расчёт справки</button><button data-action="tracker">⇥　Поехали</button><button data-action="limits">⚠　Предупреждения</button><button data-action="settings">⚙　Настройки</button><button data-action="help">ⓘ　Справка</button></nav></div>`;}
function field(label,name,value='',type='text',extra=''){return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function drawTrainModal(){
  const v=modal.value||{};
  const depotMap=new Map((catalog.depots||[]).map(d=>[String(d._id),d.depot_name||d.name||d.depot_code]));
  const depots=(catalog.depots||[]).map(d=>[d._id,d.depot_name||d.name||d.depot_code]);
  const hauls=(catalog.haul||[]).map(h=>[h._id,`${h.haul} · ${depotMap.get(String(h.depot_id))||'депо'} · ${h.length_of_haul} км`]);
  const locos=(catalog.loco||[]).map(l=>[l._id,`${l.line} · ${l.sections} сек.`]);
  const typeOptions=[['cargo','Грузовой'],['passenger','Пассажирский'],['reserve','Резерв'],['work','Хозяйственный']];
  const stations=(catalog.station||[]).map(s=>`<option value="${esc(s.station)}"></option>`).join('');
  return `<div class="modal-shade" data-action="close-modal"><form class="modal" data-form="train"><header>${modal.trainId?'Изменить поезд':'Добавить поезд'}</header><div class="body form-grid">
    ${field('Номер поезда','number',v.number||'')}${optionField('Тип', 'trafficType',typeOptions,v.trafficType||'cargo')}
    ${optionField('Депо','depotId',depots,v.depotId||'')}${optionField('Участок','haulId',hauls,v.haulId||'')}
    ${optionField('Локомотив','locoId',locos,v.locoId||'')}${field('Номер локомотива','loco',v.loco||'')}
    ${field('Откуда','from',v.from||'','text','list="station-names"')}${field('Куда','to',v.to||'','text','list="station-names"')}
    ${field('Отправление','depart',v.depart||'','datetime-local')}${field('Прибытие','arrive',v.arrive||'','datetime-local')}
    ${field('Расстояние, км','distance',v.distance||0,'number','min="0" step="0.1"')}${field('Масса поезда, т','weight',v.weight||0,'number','min="0" step="1"')}
    ${field('Оси','axles',v.axles||0,'number','min="0" step="1"')}${field('Троганий','stops',v.stops||0,'number','min="0" step="1"')}
    ${field('Стоянка, мин','idleMinutes',v.idleMinutes||0,'number','min="0" step="1"')}${field('Нагон','nagon',v.nagon||0,'number','min="0" step="1"')}
    ${field('Топливо: факт','fuelFact',v.fuelFact||0,'number','min="0" step="0.01"')}${field('Топливо: норма','fuelNorm',v.fuelNorm||0,'number','min="0" step="0.01"')}
    ${field('Энергия: факт','energyFact',v.energyFact||0,'number','min="0" step="0.01"')}${field('Энергия: норма','energyNorm',v.energyNorm||0,'number','min="0" step="0.01"')}
    <datalist id="station-names">${stations}</datalist>
    <div class="two-actions"><button type="button" data-action="calc-fuel">Рассчитать норму топлива</button></div><div id="fuel-info" class="muted"></div>
    </div><footer><button class="quiet" type="button" data-action="close-modal">Отмена</button><button class="action">Сохранить</button></footer></form></div>`;
}
function drawModal(){
  if(modal.type==='install-pwa-help')return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>Установка «Поехали»</header><div class="body"><p>Откройте страницу в браузере телефона и выберите в его меню «Установить приложение» или «Добавить на главный экран».</p><p>После первого открытия с сетью данные сохранятся для работы без интернета.</p></div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  if(modal.type==='source-route'){
    const routes=Object.entries(sourceMap?.routes||{}).map(([id,route])=>{
      const direction=route.tracks['2']?.freight?.direction;
      return `<button class="source-choice" type="button" data-action="select-source-route" data-id="${esc(id)}">${esc(direction?`${direction.from} — ${direction.to}`:id)}</button>`;
    }).join('');
    return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>Участок движения</header><div class="body source-choice-list">${routes}</div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  }
  if(modal.type==='source-category')return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>Категория поезда</header><div class="body source-choice-list">${Object.entries(sourceMap?.categories||{}).map(([id,name])=>`<button class="source-choice" type="button" data-action="select-source-category" data-id="${esc(id)}">${esc(name)}</button>`).join('')}<button class="source-choice" type="button" data-action="source-route">Участок скоростей</button><button class="source-choice" type="button" data-action="source-brake-list">Пробы тормозов</button></div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  if(modal.type==='source-detail'){
    const group=modal.group;
    return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>${esc(group.title)}</header><div class="body"><b>Основная скорость: ${esc(group.speed)} км/ч</b>${group.boundaryInferred?'<p class="muted">Границы не указаны в этой таблице; взяты из другой таблицы того же участка.</p>':''}${group.rows.map(row=>`<div class="source-detail-row"><span>${esc(row.name)}</span><b>${esc(row.speeds.join(' / '))} км/ч</b><small>${esc(row.note)}</small></div>`).join('')||'<p>Дополнительных ограничений нет</p>'}</div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  }
  if(modal.type==='source-brake'){
    const b=modal.brake;
    return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>Проба тормозов</header><div class="body"><p>${esc(b.segment)}</p><p>${esc(b.location)} · ${esc(b.speed_kmh)} км/ч · ${esc(b.distance_m)} м</p><p>${esc(sourceMap.categories[b.train_kind]||b.train_kind)} · ${b.direction==='even'?'чётное':'нечётное'} направление</p></div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  }
  if(modal.type==='source-brake-list'){
    const routeId=sourceRouteAt(state.tracker.km*1000+num(state.tracker.offset))||state.tracker.route;
    const route=sourceMap.routes[routeId];
    const items=brakesForDirection(route.brakes,state.tracker.even,state.tracker.trainCategory);
    const extra=['nizh-yurty','yurty-nizh'].includes(routeId)?brakesForDirection(sourceMap.unmappedBrakes,state.tracker.even,state.tracker.trainCategory):[];
    const rows=items.map(b=>`<button class="source-choice" data-action="source-brake-detail" data-id="${esc(b.record_id)}">${esc(b.segment)} · ${esc(b.location)} · ${esc(b.speed_kmh)} км/ч · ${esc(b.distance_m)} м</button>`).join('');
    const unplaced=extra.map(b=>`<button class="source-choice" data-action="source-brake-detail" data-id="${esc(b.record_id)}">Без привязки: ${esc(b.segment)} · ${esc(b.location)} · ${esc(b.speed_kmh)} км/ч</button>`).join('');
    return `<div class="modal-shade" data-action="close-modal"><div class="modal"><header>Пробы тормозов</header><div class="body source-choice-list">${rows||'<p>Для этого направления и категории записей нет</p>'}${unplaced?`<p>Записи вне координат участка в источнике:</p>${unplaced}`:''}</div><footer><button class="quiet" data-action="close-modal">Закрыть</button></footer></div></div>`;
  }
  if(modal.type==='day')return `<div class="modal-shade" data-action="close-modal"><form class="modal" data-form="day"><header>${modal.id?'Изменить день':'Новый рабочий день'}</header><div class="body">${field('Дата','date',modal.value?.date||today(),'date','required')}${field('Явка','signOn',modal.value?.signOn||localDatetime(),'datetime-local','required')}${field('Сдача','signOff',modal.value?.signOff||localDatetime(),'datetime-local','required')}${field('Норма часов','norm',modal.value?.norm||0,'number','min="0" step="0.01"')}</div><footer><button class="quiet" type="button" data-action="close-modal">Отмена</button><button class="action">Сохранить</button></footer></form></div>`;
  if(modal.type==='train')return drawTrainModal();
  if(modal.type==='position')return `<div class="modal-shade" data-action="close-modal"><form class="modal" data-form="position"><header>Положение на профиле</header><div class="body">${field('Километр','km',Math.floor(state.tracker.km),'number','min="0" step="1"')}${field('Пикет (0–9)','picket',Math.floor((state.tracker.km%1)*10),'number','min="0" max="9" step="1"')}${field('Участок','sector',state.tracker.sector,'number','min="0" max="60" step="1"')}${field('Поправка, м','offset',state.tracker.offset,'number','step="1"')}</div><footer><button class="quiet" type="button" data-action="close-modal">Отмена</button><button class="action">Применить</button></footer></form></div>`;
  if(modal.type==='limit'){
    const current=state.tracker.km+state.tracker.offset/1000;
    const start=coordinateParts(modal.value?.from??current),end=coordinateParts(modal.value?.to??current+1);
    return `<div class="modal-shade" data-action="close-modal"><form class="modal" data-form="limit"><header>${modal.id?'Изменить предупреждение':'Новое предупреждение'}</header><div class="body form-grid">${field('Начало · км','startKm',start.km,'number','min="1" step="1" required')}${field('Начало · пк','startPk',start.pk,'number','min="1" max="10" step="1" required')}${field('Конец · км','endKm',end.km,'number','min="1" step="1" required')}${field('Конец · пк','endPk',end.pk,'number','min="1" max="10" step="1" required')}${field('Скорость, км/ч','speed',modal.value?.speed??60,'number','min="0" step="1" required')}${field('Путь','way',modal.value?.way??state.tracker.way,'number','min="1" step="1" required')}</div><footer><button class="quiet" type="button" data-action="close-modal">Отмена</button><button class="action">Сохранить</button></footer></form></div>`;
  }
  if(modal.type==='station')return `<div class="modal-shade" data-action="close-modal"><form class="modal" data-form="station"><header>Стоянка на станции</header><div class="body">${field('Станция','name',modal.value?.name||'','text','required')}${field('Километр','km',modal.value?.km??state.tracker.km,'number','min="0" step="0.1"')}${field('Прибытие','arrival',modal.value?.arrival||'','datetime-local')}${field('Отправление','departure',modal.value?.departure||'','datetime-local')}</div><footer><button class="quiet" type="button" data-action="close-modal">Отмена</button><button class="action">Сохранить</button></footer></form></div>`;
  return '';
}
function drawDay(){
  const d=state.days.find(x=>x.id===activeDay);if(!d){screen='home';render();return;}
  const work=minutes(d.signOn,d.signOff);
  app.innerHTML=`${header('Рабочий день')}<main class="screen-page"><div class="card"><div class="row"><h2>${esc(new Intl.DateTimeFormat('ru-RU',{dateStyle:'long'}).format(dateObj(d.date)))}</h2><button data-action="edit-day">Изменить</button></div><div>Явка ${timeOnly(d.signOn)} · сдача ${timeOnly(d.signOff)}</div><div>Рабочее время ${fmtTime(work)} · норма ${esc(d.norm||0)} ч</div></div><div class="row"><h2>Поезда</h2><button class="action" data-action="new-train">+ Добавить</button></div>${(d.trains||[]).map(t=>{const duration=minutes(t.depart,t.arrive);const speed=duration?num(t.distance)/(duration/60):0;return `<div class="card"><div class="row"><div class="trip-title">Поезд ${esc(t.number||'без номера')}</div><button data-action="edit-train" data-id="${esc(t.id)}">Изменить</button></div><p>${esc(t.from||'—')} → ${esc(t.to||'—')}</p><div class="muted">${timeOnly(t.depart)} – ${timeOnly(t.arrive)} · ${esc(t.distance||0)} км · ${esc(t.weight||0)} т · ${esc(t.axles||0)} осей</div><div><span class="pill">Тех. скорость ${speed.toFixed(1)} км/ч</span><span class="pill">Топливо ${esc(t.fuelFact||0)} / ${esc(t.fuelNorm||0)}</span><span class="pill">Экономия ${money(num(t.fuelNorm)-num(t.fuelFact))}</span></div><button class="quiet" data-action="delete-train" data-id="${esc(t.id)}">Удалить поезд</button></div>`}).join('')||'<div class="empty">Поездов пока нет</div>'}<button class="quiet" data-action="delete-day">Удалить день</button></main>${modal?drawModal():''}`;
}
function settingsRow(title,subpage,summary=''){return `<button class="settings-row" data-action="settings-page" data-page="${subpage}"><span>${title}</span>${summary?`<small>${summary}</small>`:''}</button>`}
function settingsInput(label,name,unit=''){return `<label class="settings-row settings-input"><span>${label}</span><input name="${name}" type="number" min="0" step="0.01" value="${esc(state.settings[name]??0)}">${unit}</label>`}
function drawSettings(){
  const s=state.settings;
  let body='';
  if(!settingsPage)body=`${settingsRow('База данных','database')}${settingsRow('Настройки интерфейса','interface')}${settingsRow('Расчёт топлива','fuel')}${settingsRow('Тарифная ставка и надбавки','tariff')}${settingsRow('Часовой пояс','timezone')}${settingsRow('Отключить экспериментальные функции','experimental')}${settingsRow('Версия приложения','version','0.6.9')}`;
  else if(settingsPage==='display')body=`<label class="settings-row"><span>Показывать координаты объектов на карте</span><input type="checkbox" name="showMapCoordinates" ${s.showMapCoordinates?'checked':''}></label>`;
  else if(settingsPage==='database')body=`${settingsRow('Обновить данные участков','catalog','Справочники включены в HTML-версию')}${settingsRow('Загрузить базу из файла','import-db','JSON-копия HTML-версии')}${settingsRow('Сохранить базу в файл','export-db','Сохранить участки и поездки в файл')}${settingsRow('Резервное копирование','backup','Экспорт в файл')}${settingsRow('Дата обновления','date','5.05.23 15:04, v43')}<input type="file" accept="application/json,.json" id="import-file" class="hidden">`;
  else if(settingsPage==='tariff')body=`<form data-form="settings">${settingsInput('Тарифная ставка','hourlyRate','руб.')}${settingsInput('Районный коэффициент','regionFactor','%')}${settingsInput('Северный коэффициент','northernFactor','%')}${settingsInput('Надбавка за класс','classBonus','%')}${settingsInput('Зональная надбавка','zoneBonus','%')}${settingsInput('Бамовская надбавка','bamBonus','%')}${settingsInput('Ком. расходы (за поездку)','tripExpenses','руб.')}<button class="action settings-save">Сохранить</button></form>`;
  else if(settingsPage==='fuel')body=`<label class="settings-row"><span>Ограничить пережог</span><small>Ограничить максимальный пережог/экономию до 10% от нормы</small><input type="checkbox" name="restrictOveruse" ${s.restrictOveruse?'checked':''}></label>`;
  else if(settingsPage==='interface')body=`<label class="settings-row"><span>Норма на сегодня по шестидневке</span><small>Норма на сегодня по пятидневке вместо шестидневки</small><input type="checkbox" name="fiveDayNorm" ${s.fiveDayNorm?'checked':''}></label><form data-form="settings">${settingsInput('Количество секций по умолчанию','defaultSections')}${settingsInput('Количество цифр в счётчике','counterDigits')}${settingsInput('Уклон по умолчанию','defaultGradient','‰')}${settingsInput('Нажатие на 100 т по умолчанию','defaultPressure')}<button class="action settings-save">Сохранить</button></form>`;
  else if(settingsPage==='tracker')body=`<div class="settings-row"><span>Электронная карта</span><small>${profile.length} отрезков профиля, ${waypoints.length} GPS-точек; скорости по категориям из нового источника</small></div>${settingsRow('Отображение','display')}<label class="settings-row"><span>Сохранять время остановок</span><input type="checkbox" name="stationRecording" ${s.stationRecording?'checked':''}></label><label class="settings-row"><span>Предупреждать о снижении скорости</span><input type="checkbox" name="alertSpeedChanges" ${s.alertSpeedChanges?'checked':''}></label><form data-form="tracker-settings"><label class="settings-row settings-input"><span>Длина поезда, м</span><input name="trainLength" type="number" min="0" step="1" value="${esc(state.tracker.trainLength)}"></label><label class="settings-row settings-input"><span>Расстояние до снижения скорости, м</span><input name="alertBefore" type="number" min="0" step="1" value="${esc(s.alertBefore)}"></label><button class="action settings-save">Сохранить</button></form>${settingsRow('Предупреждения','limits')}${settingsRow('Стоянки','stations')}<button class="settings-row" data-action="install-pwa"><span>Скачать и установить PWA</span><small>Установить «Поехали» для работы без интернета</small></button>`;
  else if(settingsPage==='timezone')body=`<div class="settings-row">Часовой пояс устройства: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</div>`;
  else if(settingsPage==='version')body='<div class="settings-row">Блокнот машиниста 0.6.9 · HTML</div>';
  else body='<div class="settings-row">Настройка доступна в установленном приложении.</div>';
  app.innerHTML=`${header(settingsPage?({'database':'База данных','interface':'Настройки интерфейса','display':'Отображение','fuel':'Расчёт топлива','tariff':'Тарифная ставка и надбавки','tracker':'Настройки "Поехали"'}[settingsPage]||'Настройки'):'Настройки')}<main class="settings-page">${body}</main>${modal?drawModal():''}`;
}
function drawCalculator(){
  const v=state.calculator;
  const hauls=(catalog.haul||[]).map(h=>[h._id,h.haul]);
  const locos=(catalog.loco||[]).map(l=>[l._id,l.line]);
  const types=[['cargo','Грузовой'],['passenger','Пассажирский'],['reserve','Резерв'],['work','Хозяйственный']];
  app.innerHTML=`${header('Расчёт электроэнергии')}<main class="calc-page"><form data-form="calculator">${optionField('Тип поезда','trafficType',types,v.trafficType||'cargo')}${optionField('Участок','haulId',hauls,v.haulId||'2')}<label class="check-row"><span>Рассчитать вручную</span><input name="manual" type="checkbox" ${v.manual?'checked':''}></label><h3>Данные поезда</h3>${field('Вес поезда','weight',v.weight||'','number','min="0"')}${field('Количество осей','axles',v.axles||'','number','min="0"')}<h3>Данные локомотива</h3>${optionField('Локомотив','locoId',locos,v.locoId||'6')}<label class="check-row"><span>С толкачом</span><input name="withPusher" type="checkbox" ${v.withPusher?'checked':''}></label><div class="optional-fields">${field('Участок подталкивания, км','pusherLength',v.pusherLength||0,'number','min="0" step="0.1"')}${field('Секций толкача','pusherSections',v.pusherSections||0,'number','min="0"')}</div><h3>Простой и трогание</h3>${field('Троганий','stops',v.stops||0,'number','min="0"')}${field('Время простоя, мин','idleMinutes',v.idleMinutes||0,'number','min="0"')}<div class="optional-fields">${field('Удельный расход вручную','manualUdr',v.manualUdr||0,'number','min="0" step="0.001"')}${field('Норма простоя','idleRate',v.idleRate||0,'number','min="0" step="0.001"')}${field('Норма трогания','getawayRate',v.getawayRate||0,'number','min="0" step="0.001"')}</div><h3>Результат</h3><div class="result-panel" id="calculator-result">${v.result?`Норма: ${esc(v.result.norm)} · Удельный расход: ${esc(v.result.udr)}`:''}</div><div class="muted" id="calculator-haul">Длина участка: ${esc((catalog.haul||[]).find(h=>String(h._id)===String(v.haulId||'2'))?.length_of_haul||0)} км</div><button class="text-action">РАССЧИТАТЬ</button></form></main>`;
}
function drawBrakes(){
  const v=state.brakes,result=calculateBrakes({...v,gradient:v.gradient??state.settings.defaultGradient,pressurePer100:v.pressurePer100??state.settings.defaultPressure});
  app.innerHTML=`${header('Справка о тормозах')}<main class="calc-page brake-page"><form data-form="brakes">${field('Вес поезда','weight',v.weight||'','number','min="0"')}<div class="form-grid">${optionField('Уклон, ‰','gradient',gradients.map(n=>[n,n]),v.gradient??state.settings.defaultGradient)}${field('Нажатие на 100 т','pressurePer100',v.pressurePer100??state.settings.defaultPressure,'number','min="0" step="0.1"')}</div><div class="brake-result"><div>Фактическое нажатие на 100 т <b data-brake-result="actualPer100">${result.actualPer100??''}</b></div><div>Требуемое нажатие <b data-brake-result="requiredPressing">${result.requiredPressing??''}</b></div><div>Требуется ручников <b data-brake-result="handbrakes">${result.handbrakes==null?'':`${result.handbrakes} (${result.handbrakesExact})`}</b></div><div>Требуется башмаков <b data-brake-result="shoes">${result.shoes??''}</b></div></div><div class="brake-columns"><span>Нажатие на ось</span><span>Количество осей</span><span>Нажатие колодок</span></div>${result.rows.map(r=>`<div class="brake-columns"><span>${r.pressure}</span><input type="number" name="axles_${String(r.pressure).replace('.','_')}" min="0" step="1" value="${esc(r.axles||'')}"><span data-brake-row="${r.pressure}">${r.axles?r.pressing:''}</span></div>`).join('')}<div class="brake-total">Всего осей: ${result.totalAxles} · Нажатие колодок: ${result.actualPressing}</div></form></main>`;
}
function drawHelp(){app.innerHTML=`${header('Справка')}<main class="screen-page"><div class="card"><h2>Справка приложения</h2><div class="two-actions"><button data-action="help-page" data-page="help_main">Основные расчёты</button><button data-action="help-page" data-page="help_manual">Инструкция</button><button data-action="help-page" data-page="help_trains">Поезда</button></div></div><iframe title="Справка" src="source-assets/assets/help_main.html" style="width:100%;height:70vh;border:0;background:white" id="help-frame"></iframe></main>`;}
let activeDay=null;
function drawList(){
  const limits=listMode==='limits'; const items=limits?state.limits:state.stations;
  app.innerHTML=`<div class="landscape-list">${header(limits?'Предупреждения':'Стоянки на станциях')}<main class="screen-page">${items.map(x=>limits?`<div class="item warning-row"><span class="warning-summary">${coordinateLabel(x.from)} — ${coordinateLabel(x.to)} · ${esc(x.speed)} км/ч · путь ${esc(x.way||1)}</span><span class="warning-actions"><button data-action="edit-limit" data-id="${esc(x.id)}" aria-label="Изменить предупреждение">✎</button><button data-action="delete-limit" data-id="${esc(x.id)}" aria-label="Удалить предупреждение">🗑</button></span></div>`:`<div class="item row"><div><b>${esc(x.name)}</b><div class="muted">${esc(x.km)} км · ${timeOnly(x.arrival)} – ${timeOnly(x.departure)}</div></div><div><button data-action="edit-station" data-id="${esc(x.id)}">✎</button><button data-action="delete-station" data-id="${esc(x.id)}">×</button></div></div>`).join('')||'<div class="empty">Записей нет</div>'}</main><button class="fab" data-action="${limits?'new-limit':'new-station'}">+</button>${modal?drawModal():''}</div>`;
}
function currentTrack(){return state.tracker.way===1?(state.tracker.even?'1n':'1'):(state.tracker.even?'2':'2n')}
function stationDisplayEnd(station,objects,direction){
  const nominalEnd=station.coordinate+direction*station.length;
  const exits=objects.filter(o=>o.type===1&&/^[ЧН]\d/iu.test(o.name)&&
    (o.coordinate-station.coordinate)*direction>station.length*.4&&
    (o.coordinate-nominalEnd)*direction<=0);
  return exits.length?exits.sort((a,b)=>(b.coordinate-a.coordinate)*direction)[0].coordinate:nominalEnd;
}
function nextLightDistance(){
  if(!phoneMap)return 0;
  const current=state.tracker.km*1000+num(state.tracker.offset);
  const distances=mapObjects.filter(o=>o.sector===num(state.tracker.sector)&&o.track===currentTrack()&&o.type===1)
    .map(o=>(o.coordinate-current)*(state.tracker.even?1:-1)).filter(distance=>distance>0);
  return distances.length?Math.round(Math.min(...distances)):0;
}
function drawTracker(){
  const km=state.tracker.km;
  const position=state.tracker.coordinateSimple?`${Math.floor(km)+1} км ${Math.floor((km%1)*10)+1} пк`:km.toFixed(3);
  const sw=state.tracker.stopwatch;
  const overlay=sw.running?`<div class="stopwatch-overlay"><button data-action="stopwatch-pause" id="stopwatch-display">00:00:00</button><button data-action="stopwatch-reset">СБРОС</button></div>`:'';
  const lengthMode=state.tracker.lengthMode||0;
  const lengthOverlay=lengthMode?`<div class="length-overlay"><span>${lengthMode===1?'Поезд':'Локомотив'}</span><button data-action="length-down">−</button><strong>${lengthMode===1?state.tracker.trainLength:state.tracker.locoLength}</strong><button data-action="length-up">+</button></div>`:'';
  const gpsLabel=gpsMessage||({off:'GPS выключен. Нажмите для включения',searching:'Поиск координат',fixed:'Координаты получены',outside:'Координаты вне карты',error:'Ошибка GPS'}[gpsStatus]);
  const gpsNotice=gpsMessage?`<div class="gps-notice gps-notice-${gpsStatus}" role="status">${esc(gpsMessage)}</div>`:'';
  app.innerHTML=`<div class="tracker-wrap"><div class="tracker"><div class="tracker-head"><button class="coord" data-action="coordinate-view" title="Переключить координаты">${position}</button><button class="gps gps-${gpsStatus}" data-action="gps" title="${esc(gpsLabel)}" aria-label="${esc(gpsLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.62 1 17.28 6.67 15.16 8.79 13.04 6.67 11.62 8.09 13.95 10.41 12.79 11.58 13.24 12.04C14.17 11.61 15.31 11.77 16.07 12.54L12.54 16.07C11.77 15.31 11.61 14.17 12.04 13.24L11.58 12.79 10.41 13.95 8.09 11.62 6.67 13.04 8.79 15.16 6.67 17.28 1 11.62 3.14 9.5 5.26 11.62 6.67 10.21 3.84 7.38C3.06 6.6 3.06 5.33 3.84 4.55L4.55 3.84C5.33 3.06 6.6 3.06 7.38 3.84L10.21 6.67 11.62 5.26 9.5 3.14 11.62 1M18 14A4 4 0 0 1 14 18V16A2 2 0 0 0 16 14H18M22 14A8 8 0 0 1 14 22V20A6 6 0 0 0 20 14H22Z"/></svg></button><button data-action="toggle-k">К 1</button><button data-action="toggle-way">П ${state.tracker.way}</button><button data-action="toggle-even">${state.tracker.even?'ЧЕТ':'НЕЧЕТ'}</button><button class="clock" data-action="stopwatch" id="tracker-clock"></button></div><canvas class="tracker-canvas" id="profile-canvas"></canvas>${gpsNotice}<button class="train-target" data-action="length-cycle" aria-label="Длина поезда и локомотива"></button><button class="tracker-back" data-action="home">‹</button>${followTrain?"":`<button class="tracker-center" data-action="center-train" aria-label="Центрировать на поезде" title="Центрировать на поезде">◎</button>`}<div class="tracker-bottom"><button class="icon" data-action="stations">▤</button><button data-action="scale-down">−</button><span>${state.tracker.scale}</span><button data-action="scale-up">+</button><button data-action="position">${nextLightDistance()} м</button><span class="spacer"></span><button data-action="speed">V ${state.tracker.speed==null?'null':state.tracker.speedPrecise?state.tracker.speed.toFixed(2):Math.round(state.tracker.speed)}</button><button data-action="position">Уч ${state.tracker.sector}</button><button class="icon" data-action="tracker-settings" title="Настройки">⚙</button></div>${lengthOverlay}${overlay}</div>${modal?drawModal():''}</div>`;
  if(sourceMap){
    const category=document.createElement('button');category.dataset.action='source-category';category.className='source-category-button';category.title='Категория поезда';category.textContent=`🚆 ${sourceMap.categories[state.tracker.trainCategory]||'Грузовой'}`;
    document.querySelector('.tracker-head [data-action="toggle-k"]').after(category);
  }
  updateClock();paintProfile();
}
function updateClock(){const e=document.getElementById('tracker-clock');if(e)e.textContent=new Date().toLocaleTimeString('ru-RU',{hour12:false,timeZone:'UTC'});const t=document.getElementById('stopwatch-display');if(t){const sw=state.tracker.stopwatch,seconds=Math.floor((sw.elapsed+(sw.running?Date.now()-sw.startedAt:0))/1000);t.textContent=`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}}
function paintProfile(){
  const canvas=document.getElementById('profile-canvas');if(!canvas)return;
  const dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const axisY=h*.55,bottomY=h*.92,headX=w*.273,pxPerKm=w/9.2;
  const km=(viewKm??state.tracker.km)+state.tracker.offset/1000;
  const trainKm=state.tracker.km+state.tracker.offset/1000;
  const direction=state.tracker.even?1:-1;
  const toX=k=>headX+direction*(k-km)*pxPerKm;
  const sector=num(state.tracker.sector);
  const activeTrack=currentTrack();
  const activeObjects=phoneMap?mapObjects.filter(o=>o.sector===sector&&o.track===activeTrack):[];
  const stationObjects=activeObjects.filter(o=>o.type===2).sort((a,b)=>a.coordinate-b.coordinate);
  const edgeA=km-headX/(direction*pxPerKm),edgeB=km+(w-headX)/(direction*pxPerKm);
  const minKm=Math.min(edgeA,edgeB),maxKm=Math.max(edgeA,edgeB);
  ctx.strokeStyle='#aaa';ctx.lineWidth=1;ctx.font=`${Math.max(12,w*.014)}px Arial`;ctx.fillStyle='#eee';ctx.textAlign='center';
  const first=Math.floor(minKm),last=Math.ceil(maxKm);
  for(let k=first;k<=last;k++)for(let p=0;p<10;p++){
    const v=k+p/10,x=toX(v);if(x<0||x>w)continue;
    ctx.beginPath();ctx.moveTo(x,axisY);ctx.lineTo(x,bottomY);ctx.stroke();
    if(p===0){ctx.beginPath();ctx.moveTo(x,axisY-31);ctx.lineTo(x,axisY);ctx.stroke();ctx.fillText(String(k),x,axisY-35)}
    else if(p===5){ctx.beginPath();ctx.moveTo(x,axisY-18);ctx.lineTo(x,axisY);ctx.stroke()}
  }
  ctx.beginPath();ctx.moveTo(0,axisY);ctx.lineTo(w,axisY);ctx.moveTo(0,bottomY);ctx.lineTo(w,bottomY);ctx.stroke();
  const speedObjects=routeSpeedIntervals(sector,activeTrack,state.tracker.way,km*1000)
    .filter(speed=>speed.to/1000>=minKm&&speed.from/1000<=maxKm);
  const covered=speedObjects.map(speed=>{
    const a=toX(speed.from/1000),b=toX(speed.to/1000);
    return [Math.max(0,Math.min(a,b)),Math.min(w,Math.max(a,b))];
  }).filter(([left,right])=>right>left).sort((a,b)=>a[0]-b[0]);
  let coveredUntil=0;
  ctx.fillStyle='#555d61';ctx.font=`${Math.max(11,w*.012)}px Arial`;ctx.textAlign='center';
  const paintMissingSpeed=(left,right)=>{
    if(right-left<3)return;
    ctx.fillRect(left,0,right-left,speedBandHeight(80,h));
    if(right-left>90){ctx.fillStyle='#e4e4e4';ctx.fillText('Н/Д', (left+right)/2,speedBandHeight(80,h)-5);ctx.fillStyle='#555d61';}
  };
  for(const [left,right] of covered){if(left>coveredUntil)paintMissingSpeed(coveredUntil,left);coveredUntil=Math.max(coveredUntil,right)}
  if(coveredUntil<w)paintMissingSpeed(coveredUntil,w);
  for(const speed of speedObjects){
    const x1=toX(speed.from/1000),x2=toX(speed.to/1000);
    const left=Math.max(0,Math.min(x1,x2)),right=Math.min(w,Math.max(x1,x2));
    if(right>left){ctx.fillStyle=speedFlashOn(speed.key)?'#f4df1d':speed.kind==='warning'?'#df8524':speed.inferred?'#647b84':'#587484';ctx.fillRect(left,0,right-left,speedBandHeight(speed.speed,h));}
  }
  ctx.font=`${Math.max(12,w*.014)}px Arial`;ctx.textAlign='center';
  const paintSpeedLabel=(from,to,speed,key)=>{
    const a=toX(from),b=toX(to),left=Math.max(0,Math.min(a,b)),right=Math.min(w,Math.max(a,b)),width=right-left;
    if(width<22)return;
    const label=`${speed} км/ч`,short=String(speed);
    const shown=ctx.measureText(label).width+8<=width?label:ctx.measureText(short).width+8<=width?short:'';
    if(!shown)return;
    const x=(left+right)/2,y=Math.max(15,speedBandHeight(speed,h)-4),flashing=speedFlashOn(key);
    if(flashing){const textWidth=ctx.measureText(shown).width,fontSize=Math.max(12,w*.014);ctx.fillStyle='#f4df1d';ctx.fillRect(x-textWidth/2-5,y-fontSize,textWidth+10,fontSize+5);}
    ctx.fillStyle=flashing?'#202020':'#f1f1f1';ctx.fillText(shown,x,y);
  };
  for(const speed of speedObjects)paintSpeedLabel(speed.from/1000,speed.to/1000,speed.speed,speed.key);
  ctx.save();
  ctx.font=`${Math.max(9,Math.min(11,w*.008))}px Arial`;
  ctx.textAlign='left';ctx.fillStyle='#f1f1f1';
  ctx.shadowColor='#26363d';ctx.shadowBlur=3;
  for(let i=1;i<speedObjects.length;i++){
    const before=speedObjects[i-1],after=speedObjects[i];
    if(before.to!==after.from||before.speed===after.speed)continue;
    const x=toX(after.from/1000);
    if(x<0||x>w)continue;
    ctx.save();ctx.translate(x+4,7);ctx.rotate(Math.PI/2);
    ctx.fillText(coordinateLabel(after.from/1000),0,0);
    ctx.restore();
  }
  ctx.restore();
  ctx.textAlign='left';
  const currentProfile=(phoneMap?profile.filter(p=>p.sector===sector):profile).sort((a,b)=>a.start-b.start);
  let cumulativeElevation=0;
  const sections=currentProfile.map(p=>{const section={...p,elevation:cumulativeElevation};cumulativeElevation+=p.length*p.gradient/1000;return section});
  const visible=sections.filter(p=>(p.start+p.length)/1000>=minKm&&p.start/1000<=maxKm);
  const elevationAt=at=>{const p=sections.find(item=>item.start/1000<=at&&(item.start+item.length)/1000>=at);return p?p.elevation+(at*1000-p.start)*p.gradient/1000:null};
  let profileY=()=>null;
  if(visible.length){
    const positions=[minKm,maxKm,...visible.flatMap(p=>[p.start/1000,(p.start+p.length)/1000])]
      .filter(at=>at>=minKm&&at<=maxKm).sort((a,b)=>a-b);
    const samples=[...new Set(positions)].map(at=>({at,elevation:elevationAt(at)})).filter(p=>p.elevation!=null);
    if(samples.length){
      const elevations=samples.map(p=>p.elevation),low=Math.min(...elevations),high=Math.max(...elevations);
      const topLimit=axisY+3,bottomLimit=bottomY-Math.max(36,h*.08);
      const desiredVertical=Math.max(.5,h*.0016)*state.tracker.scale;
      const vertical=Math.min(desiredVertical,(bottomLimit-topLimit)/Math.max(1,high-low));
      const centerElevation=elevationAt(km)??(low+high)/2;
      let baseline=(topLimit+bottomLimit)/2+centerElevation*vertical;
      if(baseline-high*vertical<topLimit)baseline+=topLimit-(baseline-high*vertical);
      if(baseline-low*vertical>bottomLimit)baseline-=baseline-low*vertical-bottomLimit;
      profileY=at=>{const elevation=elevationAt(at);return elevation==null?null:baseline-elevation*vertical};
      ctx.beginPath();ctx.moveTo(toX(samples[0].at),bottomY);
      for(const sample of samples)ctx.lineTo(toX(sample.at),profileY(sample.at));
      ctx.lineTo(toX(samples.at(-1).at),bottomY);ctx.closePath();ctx.fillStyle='#979797';ctx.fill();
    }
    if(stationObjects.length){
      ctx.save();ctx.clip();ctx.fillStyle='#617d8599';
      for(const station of stationObjects){
        const x1=toX(station.coordinate/1000),x2=toX(stationDisplayEnd(station,activeObjects,direction)/1000);
        const left=Math.max(0,Math.min(x1,x2)),right=Math.min(w,Math.max(x1,x2));
        if(right>left)ctx.fillRect(left,axisY,right-left,bottomY-axisY);
      }
      ctx.restore();
    }
    ctx.strokeStyle='#bbb';ctx.stroke();
    ctx.save();ctx.strokeStyle='#252525';ctx.lineWidth=1;
    for(let i=1;i<sections.length;i++){
      if(num(sections[i].gradient)===num(sections[i-1].gradient))continue;
      const at=sections[i].start/1000,x=toX(at),y=profileY(at);
      if(x<0||x>w||y==null)continue;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,bottomY);ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle='#e4edef';ctx.textAlign='center';
    for(const station of stationObjects){
      const end=stationDisplayEnd(station,activeObjects,direction);
      const x1=toX(station.coordinate/1000),x2=toX(end/1000);
      const x=(x1+x2)/2,at=(station.coordinate+end)/2000,surface=profileY(at);
      if(surface==null||x<0||x>w)continue;
      const fontSize=Math.min(Math.max(14,w*.017),Math.floor(bottomY-surface-12));
      if(fontSize<10)continue;
      ctx.font=`${fontSize}px Arial`;
      const textWidth=ctx.measureText(station.name).width;
      if(Math.abs(x2-x1)<=textWidth+12||x-textWidth/2<0||x+textWidth/2>w)continue;
      ctx.fillText(station.name,x,(surface+bottomY)/2+fontSize*.35);
    }
    ctx.fillStyle='#f4ef00';ctx.font=`${Math.max(12,w*.015)}px Arial`;ctx.textAlign='center';
    for(const p of visible){
      const start=toX(p.start/1000),end=toX((p.start+p.length)/1000),x=(start+end)/2;
      const label=Number(p.gradient).toFixed(1),labelWidth=ctx.measureText(label).width;
      if(x-labelWidth/2>=0&&x+labelWidth/2<=w&&Math.abs(end-start)>=labelWidth+8)ctx.fillText(label,x,bottomY-6);
      if(start>=0&&start<w){ctx.strokeStyle='#aaa';ctx.beginPath();ctx.moveTo(start,bottomY);ctx.lineTo(start,bottomY+15);ctx.stroke()}
    }
  }else{ctx.fillStyle='#f4ef00';ctx.fillText('0.0',toX(Math.floor(km)),bottomY-4)}
  if(phoneMap){
    const before=stationObjects.filter(o=>o.coordinate/1000<=km).at(-1),after=stationObjects.find(o=>o.coordinate/1000>km);
    ctx.textAlign='left';ctx.fillStyle='#838383';ctx.font=`${Math.max(16,w*.021)}px Arial`;
    if(before)ctx.fillText(`‹ ${before.name}`,4,h*.27);
    if(after){const label=`${after.name} ›`;ctx.fillText(label,w-ctx.measureText(label).width-4,h*.27)}
    for(const signal of activeObjects){
      if(signal.type!==1)continue;
      const x=toX(signal.coordinate/1000);if(x<0||x>w)continue;
      ctx.strokeStyle='#777';ctx.beginPath();ctx.moveTo(x,axisY-10);ctx.lineTo(x,axisY-82);ctx.stroke();
      ctx.fillStyle='#eee';ctx.font=`${Math.max(11,w*.013)}px Arial`;ctx.textAlign='center';ctx.fillText(signal.name,x,axisY-84);ctx.textAlign='left';
      for(const [dy,color] of [[-54,'#a3a91d'],[-44,'#3f8a39'],[-34,'#913b3b']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,axisY+dy,Math.max(3,w*.003),0,Math.PI*2);ctx.fill()}
    }
    const sourceRoute=sourceRouteAt(km*1000,sector,state.tracker.way);
    const brakeMarkers=brakesForDirection(sourceMap?.routes?.[sourceRoute]?.brakes,state.tracker.even,state.tracker.trainCategory);
    for(const brake of brakeMarkers){
      const coordinate=(brake.km-1)+(brake.picket-1)/10,x=toX(coordinate);
      if(x<0||x>w)continue;
      ctx.strokeStyle='#ffbf55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,axisY-15);ctx.lineTo(x,axisY-64);ctx.stroke();
      ctx.fillStyle='#ffbf55';ctx.beginPath();ctx.moveTo(x,axisY-76);ctx.lineTo(x+8,axisY-65);ctx.lineTo(x,axisY-54);ctx.lineTo(x-8,axisY-65);ctx.closePath();ctx.fill();
      ctx.fillStyle='#302818';ctx.font=`${Math.max(10,w*.011)}px Arial`;ctx.textAlign='center';ctx.fillText('Т',x,axisY-61);
    }
     const drawCoordinate=(coordinate,y=axisY-116)=>{
       const x=toX(coordinate/1000);if(x<0||x>w)return;
       const label=coordinateLabel(coordinate/1000),fontSize=Math.max(11,Math.min(15,w*.011));
       ctx.save();ctx.font=`${fontSize}px Arial`;const labelWidth=ctx.measureText(label).width;
       ctx.translate(x,y-labelWidth/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';
       ctx.shadowColor='#111';ctx.shadowBlur=3;ctx.fillStyle='#fff';ctx.fillText(label,0,0);ctx.restore();
     };
     if(state.settings.showMapCoordinates){
       const shown=new Set();
       for(const signal of activeObjects.filter(o=>o.type===1)){
         if(shown.has(signal.coordinate))continue;shown.add(signal.coordinate);drawCoordinate(signal.coordinate);
       }
       for(const station of stationObjects){
         for(const coordinate of [station.coordinate,stationDisplayEnd(station,activeObjects,direction)]){
           if(shown.has(coordinate))continue;shown.add(coordinate);drawCoordinate(coordinate,axisY-65);
         }
       }
     }
  }
  for(const station of state.stations){const x=toX(num(station.km));if(x<0||x>w)continue;ctx.fillStyle='#a9caa1';ctx.fillRect(x-2,axisY-28,4,28);ctx.textAlign='center';ctx.fillText(station.name,x,axisY-34);ctx.textAlign='left'}
  const trainMeters=Math.max(0,num(state.tracker.trainLength));
  const trainHeadX=toX(trainKm),tailX=toX(trainKm-direction*trainMeters/1000);
  ctx.fillStyle=phoneMap?'#14ec06':'#999';ctx.fillRect(Math.min(trainHeadX,tailX),axisY-15,Math.max(3,Math.abs(trainHeadX-tailX)),15);
  if(phoneMap){
    ctx.strokeStyle='#f3ee00';ctx.lineWidth=3;ctx.beginPath();
    const startKm=trainKm-direction*trainMeters/1000,step=.025*direction;
    let started=false;
    for(let travelled=0;travelled<=trainMeters;travelled+=25){
      const at=startKm+step*(travelled/25),y=profileY(at);
      if(y==null){started=false;continue;}
      if(!started){ctx.moveTo(toX(at),y);started=true}else ctx.lineTo(toX(at),y);
    }
    ctx.stroke();ctx.lineWidth=1;
  }
  ctx.strokeStyle='#e7e7e7';ctx.beginPath();ctx.moveTo(trainHeadX,axisY-40);ctx.lineTo(trainHeadX,bottomY);ctx.stroke();
  const target=document.querySelector('.train-target'),tracker=document.querySelector('.tracker');
  if(target&&tracker){
    const left=Math.max(0,Math.min(trainHeadX,tailX)),right=Math.min(w,Math.max(trainHeadX,tailX));
    target.hidden=right<=left;
    target.style.left=`${canvas.offsetLeft+left}px`;
    target.style.top=`${canvas.offsetTop+axisY-18}px`;
    target.style.width=`${Math.max(0,right-left)}px`;
    target.style.height='22px';
  }
}
function render(){drawer=false;if(screen==='home')drawHome();else if(screen==='months')drawMonths();else if(screen==='day')drawDay();else if(screen==='settings')drawSettings();else if(screen==='help')drawHelp();else if(screen==='tracker')drawTracker();else if(screen==='list')drawList();else if(screen==='calculator')drawCalculator();else if(screen==='brakes')drawBrakes();}

function distanceMeters(a,b){const R=6371000,rad=Math.PI/180,dp=(b.lat-a.lat)*rad,dl=(b.lon-a.lon)*rad;const q=Math.sin(dp/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function projectGPS(position){
  if(!waypoints.length)return null;
  const p={lat:position.coords.latitude,lon:position.coords.longitude};
  let best=null;
  for(let i=0;i<waypoints.length-1;i++){
    const a=waypoints[i],b=waypoints[i+1];if((a.sector!=null&&a.sector!==b.sector)||Math.abs(b.km-a.km)>5)continue;
    const latScale=111195,lonScale=latScale*Math.cos(p.lat*Math.PI/180);
    const vx=(b.lon-a.lon)*lonScale,vy=(b.lat-a.lat)*latScale,wx=(p.lon-a.lon)*lonScale,wy=(p.lat-a.lat)*latScale;
    const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/Math.max(1,vx*vx+vy*vy)));
    const dx=wx-t*vx,dy=wy-t*vy,d=Math.hypot(dx,dy);
    if(!best||d<best.distance)best={km:a.km+t*(b.km-a.km),sector:a.sector??0,distance:d};
  }
  return best && best.distance<=550?best:null;
}
function sourceRouteAt(meters,sector=num(state.tracker.sector),track=state.tracker.way){
  if(!sourceMap)return null;
  const category=state.tracker.trainCategory;
  const candidates=Object.entries(sourceMap.routes).filter(([id])=>{
    const page=sourcePage(sourceMap,id,track,category);
    return page?.groups.some(g=>Math.min(g.start,g.end)<=meters&&meters<=Math.max(g.start,g.end));
  });
  if(candidates.some(([id])=>id===state.tracker.route))return state.tracker.route;
  if(candidates.length===1)return candidates[0][0];
  if(!candidates.length)return null;
  const oldStations=mapObjects.filter(o=>o.type===2&&o.sector===sector&&o.track===currentTrack())
    .sort((a,b)=>Math.abs(a.coordinate-meters)-Math.abs(b.coordinate-meters));
  const nearest=oldStations[0]?.name?.toLocaleLowerCase('ru').replace(/[^а-яё]/g,'').slice(0,4);
  const matching=candidates.find(([id])=>sourcePage(sourceMap,id,track,category).groups.some(g=>g.kind==='station'&&g.name.toLocaleLowerCase('ru').replace(/[^а-яё]/g,'').startsWith(nearest)));
  return matching?.[0]||candidates[0][0];
}
function routeSpeedIntervals(sector,track,way,atMeters=state.tracker.km*1000+num(state.tracker.offset)){
  const route=sourceRouteAt(atMeters,sector,way);
  const cacheKey=`${sector}:${track}:${way}:${route||'legacy'}:${state.tracker.trainCategory}`;
  if(speedSegmentCache.has(cacheKey))return speedSegmentCache.get(cacheKey);
  if(route){
    const page=sourcePage(sourceMap,route,way,state.tracker.trainCategory);
    const warnings=state.limits.filter(limit=>num(limit.way)===way&&(limit.sector==null||num(limit.sector)===sector));
    const effective=sourceCoordinateSpeeds(page,warnings,route,way,resolveSpeedSegments);
    speedSegmentCache.set(cacheKey,effective);
    return effective;
  }
  const raw=mapObjects.filter(o=>o.type===3&&o.sector===sector&&o.track===track&&num(o.length)>0)
    .map(o=>({from:o.coordinate,to:o.coordinate+o.length,speed:num(o.speed),kind:'plan'}));
  const intervals=resolveSpeedSegments(raw);
  for(const limit of state.limits){
    if(num(limit.way)!==way||(limit.sector!=null&&num(limit.sector)!==sector))continue;
    intervals.push({from:num(limit.from)*1000,to:num(limit.to)*1000,speed:num(limit.speed),kind:'warning'});
  }
  const effective=resolveSpeedSegments(intervals,false).map(item=>({...item,key:`speed:${cacheKey}:${item.from}:${item.to}:${item.speed}:${item.kind}`}));
  speedSegmentCache.set(cacheKey,effective);
  return effective;
}
function speedAt(meters,intervals){
  let lowest=null;
  for(const item of intervals)if(item.from<=meters&&meters<item.to&&(lowest==null||item.speed<lowest))lowest=item.speed;
  return lowest;
}
function lowerSpeedTransitions(sector,track,way,direction){
  const intervals=routeSpeedIntervals(sector,track,way),boundaries=new Set(intervals.flatMap(i=>[i.from,i.to]));
  const changes=[];
  for(const boundary of boundaries){
    const before=speedAt(boundary-direction,intervals),after=speedAt(boundary+direction,intervals);
    if(before==null||after==null||after>=before)continue;
    const target=intervals.find(i=>i.from<=boundary+direction&&boundary+direction<i.to&&i.speed===after);
    if(target)changes.push({meters:boundary,key:`${sector}:${track}:${way}:${direction}:${Math.round(boundary)}:${after}`,targetKey:target.key});
  }
  return changes;
}
function armSpeedAlertAudio(){
  try{const AudioContext=window.AudioContext||window.webkitAudioContext;if(AudioContext){speedAlertAudio ||= new AudioContext();speedAlertAudio.resume().catch(()=>{});}}catch{}
}
function playShortSpeedAlert(){
  if(!speedAlertAudio)return;
  const play=()=>{
    const at=speedAlertAudio.currentTime,osc=speedAlertAudio.createOscillator(),gain=speedAlertAudio.createGain();
    osc.type='square';osc.frequency.setValueAtTime(880,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.65,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+.32);
    osc.connect(gain);gain.connect(speedAlertAudio.destination);osc.start(at);osc.stop(at+.33);
  };
  if(speedAlertAudio.state==='suspended')speedAlertAudio.resume().then(play).catch(()=>{});else play();
}
function flashSpeedField(key,count){
  speedFlash={key,count,startedAt:performance.now()};
  const current=speedFlash;
  const animate=()=>{
    if(speedFlash!==current||screen!=='tracker')return;
    paintProfile();
    if(performance.now()-current.startedAt<current.count*500)requestAnimationFrame(animate);
    else{speedFlash=null;paintProfile();}
  };
  requestAnimationFrame(animate);
}
let speedAlertRoute='';
function checkSpeedTransitions(previous,match){
  if(!state.settings.alertSpeedChanges||!state.tracker.gps||!phoneMap)return;
  const sector=num(match.sector),track=currentTrack(),way=num(state.tracker.way),direction=state.tracker.even?1:-1;
  const route=`${sector}:${track}:${way}:${direction}`;
  if(route!==speedAlertRoute){approachedSpeedChanges.clear();enteredSpeedChanges.clear();speedAlertRoute=route;}
  const head=match.km*1000+num(state.tracker.offset),ahead=Math.max(0,num(state.settings.alertBefore));
  const changes=lowerSpeedTransitions(sector,track,way,direction);
  for(const change of changes){
    const distance=(change.meters-head)*direction;
    if(distance>ahead+1500||distance< -1500){approachedSpeedChanges.delete(change.key);enteredSpeedChanges.delete(change.key);}
  }
  const upcoming=changes.filter(change=>{const distance=(change.meters-head)*direction;return distance>0&&distance<=ahead&&!approachedSpeedChanges.has(change.key)})
    .sort((a,b)=>(a.meters-b.meters)*direction)[0];
  if(upcoming){approachedSpeedChanges.add(upcoming.key);playShortSpeedAlert();flashSpeedField(upcoming.targetKey,1);}
  if(!previous||previous.sector!==sector||previous.track!==track)return;
  const oldHead=previous.km*1000+num(state.tracker.offset),travelled=(head-oldHead)*direction;
  if(travelled<=0||travelled>3000)return;
  const entered=changes.filter(change=>(change.meters-oldHead)*direction>0&&(change.meters-head)*direction<=0&&!enteredSpeedChanges.has(change.key))
    .sort((a,b)=>(a.meters-b.meters)*direction);
  if(entered.length){const change=entered.at(-1);enteredSpeedChanges.add(change.key);approachedSpeedChanges.add(change.key);flashSpeedField(change.targetKey,2);}
}
function recordStationTimes(previous, match, timestamp){
  if(!state.settings.stationRecording || !phoneMap || !previous || previous.sector!==match.sector || previous.track!==currentTrack())return;
  const from=previous.km*1000, to=match.km*1000, direction=state.tracker.even?1:-1;
  const travel=(to-from)*direction;
  if(travel<=0 || travel>2000)return;
  const objects=mapObjects.filter(o=>o.sector===match.sector&&o.track===previous.track);
  for(const station of objects.filter(o=>o.type===2)){
    if((station.coordinate-from)*direction<=0 || (station.coordinate-to)*direction>0)continue;
    const exists=state.stations.some(s=>s.sector===match.sector&&s.track===previous.track&&s.coordinate===station.coordinate&&s.arrival);
    if(!exists)state.stations.push({id:uid(),name:station.name,km:station.coordinate/1000,coordinate:station.coordinate,sector:match.sector,track:previous.track,arrival:localDatetime(timestamp),departure:''});
  }
  const pending=state.stations.filter(s=>s.sector===match.sector&&s.track===previous.track&&s.arrival&&!s.departure).at(-1);
  if(pending){
    const nearSignal=objects.some(o=>o.type===1&&/^[ЧН](?![МД])/iu.test(o.name)&&((o.coordinate-to)*direction)>=0&&((o.coordinate-to)*direction)<=300);
    if(nearSignal)pending.departure=localDatetime(timestamp);
  }
  state.stations.sort((a,b)=>num(a.km)-num(b.km));
}
function gpsUpdate(position){
  const match=projectGPS(position);
  if(!match){gpsStatus='outside';gpsMessage='Координаты получены, но путь рядом не найден на карте';if(screen==='tracker')drawTracker();return;}
  gpsStatus='fixed';gpsMessage='';
  const timestamp=position.timestamp||Date.now();
  if(lastPosition && position.coords.speed==null){const dt=(timestamp-lastPosition.time)/1000,dm=distanceMeters(lastPosition,position.coords);if(dt>0&&dt<60)state.tracker.speed=Math.min(250,dm/dt*3.6)}
  else if(position.coords.speed!=null)state.tracker.speed=position.coords.speed*3.6;
  recordStationTimes(lastPosition,match,timestamp);
  state.tracker.km=match.km;state.tracker.sector=match.sector;checkSpeedTransitions(lastPosition,match);
  lastPosition={lat:position.coords.latitude,lon:position.coords.longitude,time:timestamp,km:match.km,sector:match.sector,track:currentTrack()};save();if(screen==='tracker')drawTracker();
}
function toggleGPS(){
  if(watchId!=null){navigator.geolocation.clearWatch(watchId);watchId=null;state.tracker.gps=false;gpsStatus='off';gpsMessage='';lastPosition=null;save();drawTracker();return;}
  if(!window.isSecureContext||!navigator.geolocation){gpsStatus='error';gpsMessage='Геолокация недоступна: откройте сайт через HTTPS в браузере телефона';drawTracker();return;}
  armSpeedAlertAudio();
  gpsStatus='searching';gpsMessage='Поиск координат…';state.tracker.gps=true;save();drawTracker();
  try{
    watchId=navigator.geolocation.watchPosition(gpsUpdate,error=>{
      if(watchId!=null)navigator.geolocation.clearWatch(watchId);
      watchId=null;state.tracker.gps=false;lastPosition=null;gpsStatus='error';
      gpsMessage=error.code===1?'Нет доступа к местоположению. Разрешите его для сайта в Opera и нажмите спутник снова':error.code===2?'Телефон не смог определить координаты. Проверьте GPS и нажмите спутник снова':'Координаты не получены за 20 секунд. Нажмите спутник для повтора';
      save();if(screen==='tracker')drawTracker();
    },{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  }catch{
    watchId=null;state.tracker.gps=false;gpsStatus='error';gpsMessage='Браузер не смог запустить геолокацию. Проверьте разрешения Opera';save();drawTracker();
  }
}
function navigate(target){modal=null;drawer=false;screen=target;render();}
function openModal(type,extra={}){modal={type,...extra};if(screen==='list')drawList();else if(screen==='tracker')drawTracker();else if(screen==='day')drawDay();else if(screen==='settings')drawSettings();else drawHome();}
function exportData(){const blob=new Blob([JSON.stringify({format:'trainnote-html-v1',exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`trainnote-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
let listReturn='home';
app.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action,id=el.dataset.id;
  if((action==='close-modal'||action==='close-drawer') && el!==event.target && !event.target.closest('button[data-action]'))return;
  if(action==='drawer'){drawer=true;drawHome();return;}
  if(action==='close-drawer'){drawer=false;drawHome();return;}
  if(action==='close-modal'){modal=null;render();return;}
  if(action==='home'){navigate('home');return;}
  if(action==='settings-back'){if(settingsReturn==='tracker'){if(settingsPage==='display'){settingsPage='tracker';drawSettings()}else{settingsPage='';navigate('tracker')}}else{settingsPage='';drawSettings()}return;}
  if(action==='settings-page'){
    const p=el.dataset.page;
    if(p==='export-db'||p==='backup'){exportData();return;}
    if(p==='import-db'){document.getElementById('import-file').click();return;}
    if(p==='limits'||p==='stations'){listMode=p;listReturn='settings';navigate('list');return;}
    if(p==='profile'){navigate('tracker');return;}
    settingsPage=p;drawSettings();return;
  }
  if(action==='list-back'){navigate(listReturn);return;}
  if(action==='months'){navigate('months');return;}
  if(action==='tracker'){navigate('tracker');return;}
  if(action==='calculator'){navigate('calculator');return;}
  if(action==='brakes'){navigate('brakes');return;}
  if(action==='settings'){settingsReturn=screen;settingsPage='';navigate('settings');return;}
  if(action==='tracker-settings'){settingsReturn='tracker';settingsPage='tracker';navigate('settings');return;}
  if(action==='install-pwa'){
    if(pwaInstallPrompt){const prompt=pwaInstallPrompt;pwaInstallPrompt=null;prompt.prompt();prompt.userChoice.catch(()=>{});}
    else openModal('install-pwa-help');
    return;
  }
  if(action==='help'){navigate('help');return;}
  if(action==='help-page'){document.getElementById('help-frame').src=`source-assets/assets/${el.dataset.page}.html`;return;}
  if(action==='limits'||action==='stations'){listMode=action;listReturn=screen;navigate('list');return;}
  if(action==='day'){activeDay=id;navigate('day');return;}
  if(action==='new-day'){openModal('day');return;}
  if(action==='edit-day'){const value=state.days.find(d=>d.id===activeDay);openModal('day',{id:activeDay,value});return;}
  if(action==='delete-day'){if(confirm('Удалить этот рабочий день?')){state.days=state.days.filter(d=>d.id!==activeDay);save();navigate('home')}return;}
  if(action==='new-train'){openModal('train');return;}
  if(action==='calc-fuel'){
    const form=el.closest('form');const result=calculateFuelNorm(Object.fromEntries(new FormData(form)),catalog);
    const info=form.querySelector('#fuel-info');
    if(result.error)info.textContent=result.error;
    else{form.elements.fuelNorm.value=result.norm;info.textContent=`Удельный расход ${result.udr}; тяга ${result.components.traction}; простой ${result.components.idle}; трогания ${result.components.getaway}`;}
    return;
  }
  if(action==='edit-train'){const value=state.days.find(d=>d.id===activeDay)?.trains.find(t=>t.id===id);openModal('train',{trainId:id,value});return;}
  if(action==='delete-train'){if(confirm('Удалить поезд?')){const d=state.days.find(d=>d.id===activeDay);d.trains=d.trains.filter(t=>t.id!==id);save();drawDay()}return;}
  if(action==='new-limit'){openModal('limit');return;}
  if(action==='edit-limit'){openModal('limit',{id,value:state.limits.find(x=>x.id===id)});return;}
  if(action==='delete-limit'){if(confirm('Удалить предупреждение?')){state.limits=state.limits.filter(x=>x.id!==id);speedSegmentCache.clear();save();drawList()}return;}
  if(action==='new-station'){openModal('station');return;}
  if(action==='edit-station'){openModal('station',{id,value:state.stations.find(x=>x.id===id)});return;}
  if(action==='delete-station'){if(confirm('Удалить стоянку?')){state.stations=state.stations.filter(x=>x.id!==id);save();drawList()}return;}
  if(action==='position'){openModal('position');return;}
  if(action==='source-route'){openModal('source-route');return;}
  if(action==='source-category'){openModal('source-category');return;}
  if(action==='source-brake-list'){openModal('source-brake-list');return;}
  if(action==='source-brake-detail'){
    const routeId=sourceRouteAt(state.tracker.km*1000+num(state.tracker.offset))||state.tracker.route;
    const brake=[...(sourceMap.routes[routeId]?.brakes||[]),...(sourceMap.unmappedBrakes||[])].find(item=>item.record_id===id);
    if(brake)openModal('source-brake',{brake});return;
  }
  if(action==='select-source-route'){state.tracker.route=id;speedSegmentCache.clear();modal=null;save();drawTracker();return;}
  if(action==='select-source-category'){state.tracker.trainCategory=id;speedSegmentCache.clear();modal=null;save();drawTracker();return;}
  if(action==='center-train'){viewKm=null;followTrain=true;drawTracker();return;}
  if(action==='coordinate-view'){state.tracker.coordinateSimple=!state.tracker.coordinateSimple;save();drawTracker();return;}
  if(action==='stopwatch'){
    const sw=state.tracker.stopwatch;
    if(sw.running){sw.elapsed+=Date.now()-sw.startedAt;sw.running=false;}
    else{sw.startedAt=Date.now();sw.running=true;}
    save();drawTracker();return;
  }
  if(action==='stopwatch-pause'){state.tracker.stopwatch.running=false;state.tracker.stopwatch.elapsed+=Date.now()-state.tracker.stopwatch.startedAt;save();drawTracker();return;}
  if(action==='stopwatch-reset'){state.tracker.stopwatch={running:false,startedAt:0,elapsed:0};save();drawTracker();return;}
  if(action==='gps'){toggleGPS();return;}
  if(action==='toggle-even'){state.tracker.even=!state.tracker.even;save();drawTracker();return;}
  if(action==='toggle-way'){state.tracker.way=state.tracker.way===1?2:1;save();drawTracker();return;}
  if(action==='scale-up'||action==='scale-down'){state.tracker.scale=Math.max(1,Math.min(5,state.tracker.scale+(action==='scale-up'?1:-1)));save();drawTracker();return;}
  if(action==='length-cycle'){state.tracker.lengthMode=((state.tracker.lengthMode||0)+1)%3;save();drawTracker();return;}
  if(action==='length-up'||action==='length-down'){const key=state.tracker.lengthMode===1?'trainLength':'locoLength';state.tracker[key]=Math.max(0,num(state.tracker[key])+(action==='length-up'?1:-1));save();drawTracker();return;}
  if(action==='length'){const input=prompt('Длина поезда, м',state.tracker.trainLength);if(input!=null&&Number.isFinite(Number(input))){state.tracker.trainLength=Math.max(0,Number(input));save();drawTracker()}return;}
  if(action==='speed'){state.tracker.speedPrecise=!state.tracker.speedPrecise;save();drawTracker();return;}
  if(action==='toggle-k'){state.tracker.k=state.tracker.k===1?2:1;save();drawTracker();return;}
  if(action==='save-settings'){for(const k of ['hourlyRate','regionFactor','northernFactor'])state.settings[k]=num(document.querySelector(`[name="${k}"]`).value);save();drawSettings();return;}
  if(action==='export'){exportData();return;}
  if(action==='import'){document.getElementById('import-file').click();return;}
  if(action==='search'){const q=prompt('Поиск по номеру поезда или станции');if(q){const d=state.days.find(x=>x.trains?.some(t=>`${t.number} ${t.from} ${t.to}`.toLowerCase().includes(q.toLowerCase())));if(d){activeDay=d.id;navigate('day')}else alert('Не найдено')}return;}
});
app.addEventListener('change',async event=>{
  if(['restrictOveruse','fiveDayNorm','stationRecording','alertSpeedChanges','showMapCoordinates'].includes(event.target.name)){
    state.settings[event.target.name]=event.target.checked;
    if(event.target.name==='alertSpeedChanges'&&!event.target.checked){approachedSpeedChanges.clear();enteredSpeedChanges.clear();speedFlash=null;}
    save();return;
  }
  if(event.target.closest('[data-form="brakes"]')){updateBrakes(event.target.form);return;}
  if(event.target.closest('[data-form="calculator"]')){
    const previous=state.calculator.result;
    state.calculator={...Object.fromEntries(new FormData(event.target.form)),result:previous};save();
    if(event.target.name==='haulId'||event.target.name==='trafficType'||event.target.name==='manual'||event.target.name==='withPusher')drawCalculator();
    return;
  }
  if(event.target.name==='haulId'){
    const haul=(catalog.haul||[]).find(x=>String(x._id)===event.target.value);
    const form=event.target.closest('form');if(haul&&form&&num(form.elements.distance.value)===0)form.elements.distance.value=haul.length_of_haul;
    if(haul&&form)form.elements.depotId.value=String(haul.depot_id);
    return;
  }
  if(event.target.id!=='import-file')return;
  const file=event.target.files?.[0];if(!file)return;
  try{const parsed=JSON.parse(await file.text());if(parsed.format!=='trainnote-html-v1'||!parsed.data||!Array.isArray(parsed.data.days))throw Error('Неподдерживаемый файл');state={...clone(initial),...parsed.data};speedSegmentCache.clear();save();drawSettings();alert('Данные восстановлены')}catch(e){alert(`Не удалось прочитать файл: ${e.message}`)}
});
function updateBrakes(form){
  state.brakes=Object.fromEntries(new FormData(form));save();
  const r=calculateBrakes(state.brakes);
  for(const [key,value] of Object.entries({actualPer100:r.actualPer100,requiredPressing:r.requiredPressing,handbrakes:r.handbrakes==null?'':`${r.handbrakes} (${r.handbrakesExact})`,shoes:r.shoes}))form.querySelector(`[data-brake-result="${key}"]`).textContent=value??'';
  for(const row of r.rows)form.querySelector(`[data-brake-row="${row.pressure}"]`).textContent=row.axles?row.pressing:'';
  form.querySelector('.brake-total').textContent=`Всего осей: ${r.totalAxles} · Нажатие колодок: ${r.actualPressing}`;
}
app.addEventListener('input',event=>{
  const form=event.target.closest('[data-form]');
  if(form?.dataset.form==='brakes')updateBrakes(form);
});
app.addEventListener('submit',event=>{
  const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();
  const data=Object.fromEntries(new FormData(form));const type=form.dataset.form;
  if(type==='settings'){Object.assign(state.settings,data);save();drawSettings();return;}
  if(type==='tracker-settings'){
    state.tracker.trainLength=Math.max(0,Math.floor(num(data.trainLength)));
    state.settings.alertBefore=Math.max(0,Math.floor(num(data.alertBefore)));
    save();drawSettings();return;
  }
  if(type==='calculator'){
    const haul=(catalog.haul||[]).find(h=>String(h._id)===String(data.haulId));
    data.distance=haul?.length_of_haul||0;
    const result=calculateFuelNorm(data,catalog);
    state.calculator={...data,result};save();
    const info=form.querySelector('#calculator-result');info.textContent=result.error||`Норма: ${result.norm}; удельный расход: ${result.udr}; тяга: ${result.components.traction}; простой: ${result.components.idle}`;
    return;
  }
  if(type==='brakes'){state.brakes=data;save();drawBrakes();return;}
  if(type==='day'){
    if(new Date(data.signOff)<new Date(data.signOn)){alert('Проверьте время сдачи');return;}
    if(modal.id){const d=state.days.find(x=>x.id===modal.id);Object.assign(d,data)}else{const d={id:uid(),...data,trains:[]};state.days.push(d);activeDay=d.id;screen='day'}
  }else if(type==='train'){
    const d=state.days.find(x=>x.id===activeDay);if(modal.trainId)Object.assign(d.trains.find(x=>x.id===modal.trainId),data);else d.trains.push({id:uid(),...data});
  }else if(type==='position'){
    const proposed=Math.max(0,num(data.km)+Math.min(9,Math.max(0,num(data.picket)))/10);
    state.tracker.km=proposed;state.tracker.sector=Math.max(0,Math.floor(num(data.sector)));state.tracker.offset=num(data.offset);
    viewKm=null;followTrain=true;
  }else if(type==='limit'){
    const parts=['startKm','startPk','endKm','endPk','speed','way'].map(key=>Number(data[key]));
    if(parts.some(value=>!Number.isInteger(value))||parts[0]<1||parts[2]<1||parts[1]<1||parts[1]>10||parts[3]<1||parts[3]>10||parts[4]<0||parts[5]<1){alert('Проверьте километры, пикеты, скорость и путь');return;}
    const from=parts[0]-1+(parts[1]-1)/10,to=parts[2]-1+(parts[3]-1)/10;
    if(sourceMap?to===from:to<=from){alert('Начало и конец предупреждения должны различаться');return;}
    const warning={from,to,speed:parts[4],way:parts[5],sector:null,route:sourceMap?state.tracker.route:null};
    if(modal.id)Object.assign(state.limits.find(x=>x.id===modal.id),warning);else state.limits.push({id:uid(),...warning,star:false});
    state.limits.sort((a,b)=>num(a.from)-num(b.from));
    speedSegmentCache.clear();
  }else if(type==='station'){
    if(modal.id)Object.assign(state.stations.find(x=>x.id===modal.id),data);else state.stations.push({id:uid(),...data});
    state.stations.sort((a,b)=>num(a.km)-num(b.km));
  }
  modal=null;save();render();
});
function syncPhoneOrientation(){
  const flipped=window.screen.orientation?.type==='portrait-secondary'||(!window.screen.orientation?.type&&window.orientation===180);
  document.documentElement.classList.toggle('portrait-flipped',flipped);
  if(screen==='tracker')requestAnimationFrame(paintProfile);
}
window.screen.orientation?.addEventListener?.('change',syncPhoneOrientation);
window.addEventListener('orientationchange',syncPhoneOrientation);
window.addEventListener('resize',syncPhoneOrientation);
syncPhoneOrientation();
function canvasPoint(event,canvas){
  const rect=canvas.getBoundingClientRect();
  if(matchMedia('(orientation:portrait) and (max-width:700px)').matches){
    if(document.documentElement.classList.contains('portrait-flipped'))return {x:rect.bottom-event.clientY,y:event.clientX-rect.left};
    return {x:event.clientY-rect.top,y:rect.right-event.clientX};
  }
  return {x:event.clientX-rect.left,y:event.clientY-rect.top};
}
let dragX=null,dragStart=null,dragMoved=false;
app.addEventListener('pointerdown',event=>{if(event.target.id==='profile-canvas'){dragX=canvasPoint(event,event.target).x;dragStart={x:event.clientX,y:event.clientY};dragMoved=false;event.target.setPointerCapture(event.pointerId)}});
app.addEventListener('pointermove',event=>{
  if(dragX==null||event.target.id!=='profile-canvas')return;
  if(!dragMoved&&Math.hypot(event.clientX-dragStart.x,event.clientY-dragStart.y)<5)return;
  dragMoved=true;
  const canvas=event.target,nextX=canvasPoint(event,canvas).x,dx=nextX-dragX;dragX=nextX;
  viewKm=Math.max(0,(viewKm??state.tracker.km)-(state.tracker.even?1:-1)*dx/(canvas.clientWidth/9.2));
  followTrain=false;paintProfile();
});
app.addEventListener('pointerup',event=>{
  if(dragX==null)return;
  const moved=dragMoved;dragX=null;dragStart=null;dragMoved=false;
  if(moved)drawTracker();
  else if(sourceMap&&phoneMap&&event.target.id==='profile-canvas'){
    const canvas=event.target,point=canvasPoint(event,canvas),w=canvas.clientWidth,h=canvas.clientHeight,axisY=h*.55;
    if(point.y<axisY-90||point.y>axisY-35)return;
    const center=(viewKm??state.tracker.km)+num(state.tracker.offset)/1000,route=sourceRouteAt(center*1000,num(state.tracker.sector),state.tracker.way);
    const brakes=brakesForDirection(sourceMap.routes[route]?.brakes,state.tracker.even,state.tracker.trainCategory);
    const marker=brakes.find(b=>Math.abs(canvas.clientWidth*.273+(state.tracker.even?1:-1)*((b.km-1)+(b.picket-1)/10-center)*(w/9.2)-point.x)<13);
    if(marker)openModal('source-brake',{brake:marker});
  }
});
app.addEventListener('wheel',event=>{if(event.target.id!=='profile-canvas')return;event.preventDefault();state.tracker.scale=Math.max(1,Math.min(5,state.tracker.scale+(event.deltaY<0?1:-1)));save();drawTracker()},{passive:false});
setInterval(updateClock,1000);
const catalogNames=['branches','depots','haul','loco','station','station_on_haul','traffic_type','udr_cargo','udr_pass','udr_reserve','udr_work'];
Promise.all([
  fetch('data/profile.json').then(r=>r.json()),
  fetch('data/waypoints.json').then(r=>r.json()),
  Promise.all(catalogNames.map(name=>fetch(`data/catalog/${name}.json`).then(r=>r.json()).then(value=>[name,value]))),
  !hadSaved?fetch('user-backup/seed.json').then(r=>r.ok?r.json():null).catch(()=>null):Promise.resolve(null),
  fetch('data/phone-map.json').then(r=>r.ok?r.json():null).catch(()=>null),
  fetch('data/skorostya-map.json').then(r=>r.ok?r.json():null).catch(()=>null)
]).then(([p,w,entries,seed,map,speeds])=>{
  profile=map?.profiles||p;waypoints=map?.geo||w;mapObjects=map?.objects||[];phoneMap=!!map;sourceMap=speeds;catalog=Object.fromEntries(entries);
  speedSegmentCache.clear();
  if(seed?.data?.days){state.days=seed.data.days;save()}
  if(map&&!hadSaved){state.tracker.km=269.362;state.tracker.sector=12;state.tracker.speed=0;}
  if(map&&!state.limits.length){
    state.limits=map.tempLimits.map((x,i)=>({id:`phone-${i}`,from:Math.min((x.start_km-1)+(x.start_pk-1)/10,(x.end_km-1)+(x.end_pk-1)/10),to:Math.max((x.start_km-1)+(x.start_pk-1)/10,(x.end_km-1)+(x.end_pk-1)/10),speed:x.speed,way:x.way_number,sector:x.sector,star:x.starred,name:x.name}));
  }
  if(map)save();
  render();
}).catch(e=>{console.error(e);render()});
render();




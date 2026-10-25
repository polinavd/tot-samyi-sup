import {spoilage,cooking,finalVerdict,rankTeams,scaledRoster,hagHP} from './rules.mjs';
const ID='tot-samyi-sup', BASE=`modules/${ID}`;
let index, panel;
const clone=o=>foundry.utils.deepClone(o);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gm=()=>{if(!game.user.isGM)throw new Error('Доступно только ведущему.');};
const users=()=>game.users.filter(u=>u.isGM).map(u=>u.id);
const whisper=content=>CONFIG.ChatMessage.documentClass.create({content:`<div class="tss-chat">${content}</div>`,whisper:users()});
const initial=()=>({round:1,size:4,level:4,partyIds:[],ingredients:[],results:[],retried:false,victims:[],lairLast:'',teams:{sugar:{name:'Жжёный сахар',members:['mirta','pyshka']},spoons:{name:'Две ложки',members:['groh','shpyn']},brothers:{name:'Братство святого Кабачка',members:['goroh','fasol']}}});
const state=()=>clone(game.settings.get(ID,'tournament'));
const save=s=>game.settings.set(ID,'tournament',s);
const sceneKey=r=>['','round1','round2','final'][r];
const moduleActor=key=>game.actors.get(index.actors[key])??game.actors.find(a=>a.getFlag(ID,'key')===key);
const moduleScene=key=>game.scenes.get(index.scenes[key])??game.scenes.find(s=>s.getFlag(ID,'key')===key);
const party=s=>s.partyIds.map(id=>game.actors.get(id)).filter(a=>a&&!s.victims.some(v=>v.actorId===a.id));
const notifyError=error=>{console.error(`${ID} |`,error);ui.notifications.error(error.message??String(error));};
async function ask(title,content,label='Продолжить') {
  return foundry.applications.api.DialogV2.prompt({window:{title},position:{width:560},content:`<div class="tss-dialog">${content}</div>`,rejectClose:false,ok:{label,callback:(event,button)=>new FormData(button.form)}});
}
function select(name,label,options,value) {
 return `<label>${e(label)}<select name="${e(name)}">${options.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value)?'selected':''}>${e(t)}</option>`).join('')}</select></label>`;
}
function number(name,label,value=0,min=0,max=999){return `<label>${e(label)}<input type="number" name="${e(name)}" value="${value}" min="${min}" max="${max}" required></label>`;}
function check(name,label,checked=false){return `<label class="tss-check"><input type="checkbox" name="${e(name)}" ${checked?'checked':''}>${e(label)}</label>`;}
async function loadIndex(){index??=await foundry.utils.fetchJsonWithTimeout(`${BASE}/data/index.json`);return index;}
async function openGuide(){gm();await loadIndex();const doc=game.journal.get(index.guide);if(doc)return doc.sheet.render(true);return openImport();}
async function openImport(){gm();await loadIndex();const pack=game.packs.get(`${ID}.adventure`);if(!pack)throw new Error('Компендий приключения не найден. Проверьте установку модуля.');const adv=await pack.getDocument(index.adventure);if(!adv)throw new Error('Запись приключения не найдена в компендии.');return adv.sheet.render(true);}
async function openPanel(){gm();await loadIndex();panel??=new SoupPanel();return panel.render(true);}

/** Validate against the actual running Foundry/dnd5e schemas. Does not save documents. */
async function diagnose(){
 gm();await loadIndex();
 const data=await foundry.utils.fetchJsonWithTimeout(`${BASE}/data/adventure.json`),failures=[];
 let checked=0;
 for(const [kind,docs] of [['Actor',data.actors],['Item',data.items],['JournalEntry',data.journal],['Scene',data.scenes],['Macro',data.macros],['RollTable',data.tables]]){
  const C=CONFIG[kind].documentClass;
  for(const raw of docs){
   try{const doc=new C(clone(raw),{strict:true});if(!doc.validate({strict:true}))throw new Error('validate вернул false');checked++;}
   catch(error){failures.push(`${kind}: ${raw.name}: ${error.message}`);}
  }
 }
 const content=`<h3>Проверка «Тот Самый Суп»</h3><p>Foundry ${e(game.version)}, dnd5e ${e(game.system.version)}. Проверено документов: ${checked}; ошибок: ${failures.length}.</p>${failures.length?`<pre>${failures.map(e).join('\n')}</pre>`:'<p>Схемы данных приняты текущим игровым движком. Это не заменяет проверку боя и видимости игроком.</p>'}`;
 await whisper(content);
 if(failures.length)ui.notifications.error(`Проверка: ${failures.length} ошибок. Отчёт отправлен ведущему в чат.`);else ui.notifications.info('Данные прошли проверку текущей версии Foundry. Отчёт в чате.');
 return {checked,failures};
}

class SoupPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
 static DEFAULT_OPTIONS={id:'tss-panel',tag:'section',classes:['tss-panel'],window:{title:'Тот Самый Суп · Панель ведущего',resizable:true},position:{width:650,height:800},actions:{dispatch:async function(event,target){
   if(this.busy)return;this.busy=true;target.disabled=true;
   try{gm();await this.act(target.dataset.command,target);}catch(error){notifyError(error);}finally{this.busy=false;target.disabled=false;if(this.rendered)this.render(false);}
 }}};
 static PARTS={body:{template:`${BASE}/templates/panel.hbs`}};
 async _prepareContext(){
  const s=state();const roundRows=s.ingredients.filter(i=>i.round===s.round);
  return {round:s.round,roundName:['','Закуска','Горячее','Финал — Суп'][s.round],size:s.size,level:s.level,round1:s.round===1,round2:s.round===2,round3:s.round===3,small:s.size===3,normal:s.size===4,large:s.size===5,level4:s.level===4,level5:s.level===5,
   characters:game.actors.filter(a=>a.type==='character').map(a=>({id:a.id,name:a.name,selected:s.partyIds.includes(a.id)})),
   ingredients:roundRows.map(i=>({...i,condition:i.spoiled?'Испорчено':'Годное',ownerName:{floor:'На полу',heroes:'У героев',rivals:'У соперников'}[i.owner],floor:i.owner==='floor',heroes:i.owner==='heroes',rivals:i.owner==='rivals'})),
   results:s.results.map(r=>({round:r.round,total:r.total,result:r.label})),hasResults:s.results.length>0,
   teams:Object.entries(s.teams).map(([k,t])=>({key:k,name:t.name,count:t.members.length})),victims:s.victims.map(v=>({name:game.actors.get(v.actorId)?.name??v.actorId})),hasVictims:s.victims.length>0,retried:s.retried,
   imported:Boolean(game.journal.get(index.guide))};
 }
 async act(command,target){
  if(command==='import')return openImport();
  if(command==='guide')return openGuide();
  if(command==='diagnose')return diagnose();
  if(command==='config')return this.configure();
  if(command==='prepare')return this.prepare();
  if(command==='combat')return this.combat();
  if(command==='harvest')return this.harvest();
  if(command==='cook')return this.cook();
  if(command==='undo-result'){
   const s=state();if(!s.results.length)return;
   const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Исправить последнюю оценку'},content:'<p>Удалить только последнюю запись готовки, чтобы исправить ошибочный выбор продуктов или настройки броска? Добыча и прочие события сохранятся.</p>'});
   if(ok){s.results.pop();s.retried=s.results.some(r=>r.round===3&&r.label.startsWith('«Почти»'));await save(s);}return;
  }
  if(command==='temp')return this.tempHP();
  if(command==='cauldron')return this.cauldron();
  if(command==='ghost')return this.ghost();
  if(command==='loss')return this.loss();
  if(command==='lair')return this.lair();
  if(command==='boss')return this.boss();
  if(command==='owner')return this.owner(target.dataset.id);
  if(command==='reset'){
   const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Начать новый учёт турнира'},content:'<p>Очистить добычу, результаты и список потерь? Токены, хиты и документы мира сохранят текущее состояние. Для полностью новой игры импортируйте приключение в новый мир.</p>'});
   if(ok)await save(initial());
  }
 }
 async configure(){
  const f=new FormData(this.element.querySelector('.tss-configuration')),s=state();
  s.partyIds=f.getAll('party');s.round=Number(f.get('round'));s.size=Number(f.get('size'));s.level=Number(f.get('level'));
  if(![1,2,3].includes(s.round)||![3,4,5].includes(s.size)||![4,5].includes(s.level))throw new Error('Некорректная настройка тура.');
  if(s.partyIds.length&&s.partyIds.length!==s.size)ui.notifications.warn('Число выбранных персонажей отличается от размера группы. Сложность определяется полем «Группа».');
  await save(s);ui.notifications.info('Настройки турнира сохранены.');
 }
 async prepare(){
  const s=state(),scene=moduleScene(sceneKey(s.round));if(!scene)throw new Error('Сначала импортируйте приключение из компендия.');
  if(!s.partyIds.length)throw new Error('Сначала выберите персонажей и сохраните настройки.');
  if(!scene.getFlag(ID,'prepared')){
   const roster=scaledRoster(s.round,s.size,s.level),need=new Map();for(const key of roster)need.set(key,(need.get(key)??0)+1);
   const updates=[];
   for(const t of scene.tokens){
    const key=t.getFlag(ID,'ingredient');
    if(key){const n=need.get(key)??0;updates.push({_id:t.id,hidden:n<=0||(s.round===3&&key==='bone'),[`flags.${ID}.disabled`]:n<=0});need.set(key,Math.max(0,n-1));}
    else if(['groh','shpyn'].includes(t.actor?.getFlag(ID,'key'))){const alive=s.teams.spoons.members.includes(t.actor.getFlag(ID,'key'));updates.push({_id:t.id,hidden:!alive,[`flags.${ID}.disabled`]:!alive});}
   }
   if(updates.length)await scene.updateEmbeddedDocuments('Token',updates);
   const extra=[];
   for(const [key,n] of need)for(let i=0;i<n;i++){
    const a=moduleActor(key);if(!a)throw new Error(`Не найдено существо: ${key}`);
    const t=clone(a.prototypeToken.toObject());delete t._id;
    extra.push({...t,actorId:a.id,actorLink:false,x:2550,y:750+i*150,level:scene.firstLevel.id,flags:{[ID]:{ingredient:key,extra:true}}});
   }
   if(extra.length)await scene.createEmbeddedDocuments('Token',extra);
   await scene.setFlag(ID,'prepared',true);
  }else ui.notifications.info('Сцена уже подготовлена. Состояние существ сохранено; сложность повторно не пересчитывается.');
  await this.placeParty(scene,s);
  await scene.activate();await scene.view();
  await whisper(`<h3>${e(scene.name)}</h3><p>Охота длится 10 раундов. Бой создаётся отдельной кнопкой. ${s.round===3?'Кость скрыта до обнаружения. Колобок не делает Рывок; до лаза от двери 90 фт. На инициативе 20 — 10 временных хитов одному ингредиенту, кроме лука.':''}</p>`);
 }
 async placeParty(scene,s,kitchen=false){
  const positions=kitchen?[{x:3750,y:1900},{x:3850,y:2000},{x:3650,y:2000},{x:3950,y:1900},{x:3550,y:1900}]:scene.getFlag(ID,'partyPositions');
  const create=[];let i=0;
  for(const a of party(s)){
   if(scene.tokens.some(t=>t.actorId===a.id&&t.getFlag(ID,'party')))continue;
   const t=clone(a.prototypeToken.toObject());delete t._id;
   const p=positions[i++%positions.length];create.push({...t,actorId:a.id,actorLink:true,x:p.x,y:p.y,level:scene.firstLevel.id,disposition:1,hidden:false,flags:{[ID]:{party:true}}});
  }
  if(create.length)await scene.createEmbeddedDocuments('Token',create);
 }
 async combat(){
  const s=state(),scene=moduleScene(sceneKey(s.round));if(!scene||canvas.scene?.id!==scene.id)throw new Error('Сначала подготовьте сцену текущего тура.');
  const existing=game.combats.find(c=>c.scene?.id===scene.id&&c.getFlag(ID,'round')===s.round);
  if(existing){await existing.activate();ui.notifications.info('Бой этого тура уже существует. Откройте его в трекере.');return;}
  const tokens=scene.tokens.filter(t=>!t.getFlag(ID,'disabled')&&(t.getFlag(ID,'ingredient')||t.getFlag(ID,'party')||['groh','shpyn'].includes(t.actor?.getFlag(ID,'key'))));
  const c=await CONFIG.Combat.documentClass.create({scene:scene.id,active:true,flags:{[ID]:{round:s.round,timer:true,expired:false}}});
  await c.createEmbeddedDocuments('Combatant',tokens.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId,hidden:t.hidden})));
  await c.activate();ui.notifications.info('Бой создан. Бросьте инициативу и начните бой обычной кнопкой.');
 }
 async harvest(){
  const s=state(),t=canvas.tokens.controlled[0]?.document;
  if(!t?.getFlag(ID,'ingredient'))throw new Error('Выберите один токен ингредиента на текущей сцене.');
  if(canvas.tokens.controlled.length!==1)throw new Error('Выберите ровно один токен ингредиента.');
  if(t.getFlag(ID,'disabled'))throw new Error('Этот ингредиент выключен настройкой сложности.');
  if(canvas.scene?.getFlag(ID,'round')!==s.round)throw new Error('Текущая сцена не соответствует выбранному туру.');
  if(s.ingredients.some(i=>i.tokenUuid===t.uuid))throw new Error('Состояние этого ингредиента уже зафиксировано. Изменить можно только владельца.');
  const hp=t.actor.system.attributes.hp;
  const f=await ask('Добивающий удар',`<p><strong>${e(t.name)}</strong>. Введите хиты <em>до</em> добивающего удара, включая временные. Урон — фактически нанесённый после сопротивлений и иммунитетов. Для смешанного удара отметьте все нанесённые типы порчи.</p>${number('remaining','Хиты + временные до удара',Math.max(1,hp.value+(hp.temp??0)),1)}${number('damage','Фактический урон добивающего удара',Math.max(1,hp.value+(hp.temp??0)),1)}${check('acid','Удар содержит урон кислотой')}${check('necrotic','Удар содержит некротический урон')}${check('poison','Удар содержит урон ядом')}${select('owner','После удара ингредиент…',[['floor','Лежит на полу'],['heroes','Подобран героями'],['rivals','Унесён соперниками']],'floor')}`,'Зафиксировать');
  if(!f)return;
  const key=t.getFlag(ID,'ingredient'),spoiled=spoilage({remaining:Number(f.get('remaining')),damage:Number(f.get('damage')),types:['acid','necrotic','poison'].filter(k=>f.has(k)),alwaysSpoiled:key==='bone'});
  const row={id:foundry.utils.randomID(),tokenUuid:t.uuid,key,name:t.name,spoiled,owner:f.get('owner'),round:s.round};
  // Persist the ledger first. If a token update fails the authoritative result is not lost.
  s.ingredients.push(row);await save(s);
  await t.setFlag(ID,'harvested',true);await t.actor.update({'system.attributes.hp.value':0,'system.attributes.hp.temp':0});
  await whisper(`<p>${e(t.name)}: <strong>${spoiled?'испорчено':'годное'}</strong>. Состояние зафиксировано. Подбор требует обычного взаимодействия с предметом в 5 фт.; ведущий проверяет дистанцию.</p>`);
 }
 async owner(id){
  const s=state(),i=s.ingredients.find(i=>i.id===id);if(!i)return;
  const f=await ask('Кто подобрал ингредиент',`<p>${e(i.name)} · ${i.spoiled?'испорчено':'годное'}. Меняется только владелец. Проверьте взаимодействие с предметом и дистанцию 5 фт.</p>${select('owner','Где продукт',[['floor','На полу'],['heroes','У героев'],['rivals','Унесён соперниками']],i.owner)}`,'Сохранить');
  if(f){i.owner=f.get('owner');await save(s);}
 }
 async cook(){
  const s=state(),required=s.round===3?4:3,stock=s.ingredients.filter(i=>i.round===s.round&&i.owner==='heroes');
  const prior=s.results.filter(r=>r.round===s.round);
  if(prior.length&&(s.round<3||!prior.at(-1).label.startsWith('«Почти»')))throw new Error('Этот тур уже оценён. Для исправления ошибки используйте «Исправить последнюю оценку».');
  const cooks=party(s);if(!cooks.length)throw new Error('Выберите персонажей группы в настройках.');
  const content=`<p>Выберите до ${required} продуктов для блюда. Недостающие и испорченные дают −2 каждый. Сл 13. Используется штатная проверка Мудрости с инструментами повара: владение, состояния и особенности берутся из листа. Укажите владение инструментами повара в листе до броска.</p>${select('cook','Повар',cooks.map(a=>[a.id,a.name]),cooks[0].id)}<fieldset><legend>Ингредиенты блюда</legend>${stock.length?stock.map(i=>check(`ing-${i.id}`,`${i.name} · ${i.spoiled?'испорчено':'годное'}`,stock.length<=required)).join(''):'<p>Нет подобранных продуктов. Можно приготовить блюдо со штрафом за недостающие.</p>'}</fieldset>${check('help','Другой участник помогает — преимущество')}${s.round===2?check('broth','Герои приняли бульон — +2'):''}${check('intentional','Повар намеренно проваливает готовку')}`;
  const f=await ask(s.round===3?'Финальная готовка':'Проверка готовки',content,'Приготовить');if(!f)return;
  const chosen=stock.filter(i=>f.has(`ing-${i.id}`));if(chosen.length>required)throw new Error(`Выбрано больше ${required} продуктов.`);
  if(s.round===3&&prior.length&&chosen.map(i=>i.id).sort().join(',')!==[...prior[0].ingredients].sort().join(','))throw new Error('Повторная готовка разрешена только из тех же ингредиентов, что и первая.');
  const actor=game.actors.get(f.get('cook'));
  const result=cooking({ingredients:chosen,required,wisdom:0,intentional:f.has('intentional')});
  if(!f.has('intentional')){
   const broth=s.round===2&&f.has('broth')?2:0;
   const rolls=await actor.rollToolCheck({tool:'cook',ability:'wis',bonus:String(broth-result.penalty),...(f.has('help')?{advantage:true}:{}),target:13},{options:{chooseAbility:false}},{data:{flavor:`Готовка · Сл 13 · испорчено ${result.spoiled}, не хватает ${result.missing}, штраф −${result.penalty}${broth?', бульон +2':''}`}});
   if(!rolls?.length)return;
   result.total=rolls[0].total;result.success=result.total>=13;
  }
  let label=result.success?'Блюдо удалось':'Блюдо не удалось';
  if(s.round===3){
   const verdict=finalVerdict(chosen,result.success,s.retried);
   label={win:'Правильный суп — договор разорван',retry:'«Почти» — разрешена одна повторная готовка',fight:'«Не то» — бой со Шкваркой'}[verdict];
   if(verdict==='retry')s.retried=true;
  }
  s.results.push({...result,round:s.round,label,cook:actor.id,ingredients:chosen.map(i=>i.id)});await save(s);
  if(f.has('intentional'))await whisper('<p>Повар намеренно провалил готовку. Для сравнения обычного тура используется технический результат 0.</p>');
  await whisper(`<h3>${e(label)}</h3><p>Итог ${result.total}; испорчено ${result.spoiled}; не хватает ${result.missing}. ${s.round===3?'Финальный исход показан только ведущему.':'Дарина показывает '+(result.success?'0.':'1, её руки дрожат.')}</p>`);
  if(s.round<3)await this.judge(s,result);
 }
 async judge(s,result){
  const rivals=Object.entries(s.teams).filter(([,t])=>t.members.length).map(([key,t])=>({key,name:t.name,total:key==='sugar'?15:key==='spoons'?13+(s.round===2?2*s.ingredients.filter(i=>i.round===2&&i.owner==='rivals').length:0):s.round===1?10:16,defects:0,heroes:false}));
  const ties=rivals.filter(t=>t.total===result.total);
  if(ties.length){
   const f=await ask('Равенство результатов',`<p>Укажите сумму испорченных и недостающих ингредиентов команд с тем же результатом. В источнике этих чисел нет.</p>${ties.map(t=>number(t.key,t.name,0,0,3)).join('')}`,'Определить проигравшего');
   if(!f){await whisper('<p>Равенство не разрешено: ведущий должен определить проигравшего вручную.</p>');return;}
   for(const t of ties)t.defects=Number(f.get(t.key));
  }
  const ranked=rankTeams([{key:'heroes',name:'Персонажи',total:result.total,defects:result.defects,heroes:true},...rivals]);
  await whisper(`<h3>Оценка тура ${s.round}</h3><p>${ranked.map(t=>`${e(t.name)}: ${t.total}`).join(' · ')}</p><p>Проигрывает: <strong>${e(ranked[0].name)}</strong>. За 1 минуту команда отдаёт участника в котёл. Решение и появление призрака ведёт мастер. Потерю соперника отметьте кнопкой панели.</p>`);
 }
 async tempHP(){
  const t=canvas.tokens.controlled[0]?.document;
  if(state().round!==3||!t?.getFlag(ID,'ingredient'))throw new Error('В финале выберите токен ингредиента.');
  if(canvas.tokens.controlled.length!==1)throw new Error('Выберите ровно один токен.');
  if(t.getFlag(ID,'ingredient')==='onion')throw new Error('Луковая стая не получает временные хиты.');
  if(t.getFlag(ID,'harvested')||t.getFlag(ID,'disabled'))throw new Error('Этот ингредиент уже собран или выключен.');
  await t.actor.update({'system.attributes.hp.temp':Math.max(10,t.actor.system.attributes.hp.temp??0)});
  await whisper(`<p>«Аккуратнее!» ${e(t.name)} получает 10 временных хитов; они не складываются с уже имеющимися. Используйте на инициативе 20, проигрывая равенство.</p>`);
 }
 async cauldron(){
  const t=canvas.tokens.controlled[0];if(!t?.actor)throw new Error('Выберите токен жертвы в котле.');
  const r=await new foundry.dice.Roll('3d6').evaluate();await r.toMessage({flavor:`Большой котёл · ${e(t.name)} · урон огнём в начале хода.`});
  await whisper(`<p>К ${e(t.name)} нужно применить ${r.total} урона огнём с учётом сопротивлений. В котле существо опутано. Выход действием: Атлетика или Акробатика Сл 13. При 0 хитах призрак садится за стол, спасбросков от смерти нет. Применение урона и перемещение — средствами системы.</p>`);
 }
 async ghost(){
  const s=state(),actors=s.partyIds.map(id=>game.actors.get(id)).filter(a=>a&&!s.victims.some(v=>v.actorId===a.id));if(!actors.length)throw new Error('Нет персонажей, которых можно отметить попавшими в котёл.');
  const f=await ask('Персонаж попал в котёл',`<p>Создаётся отдельный лист призрака с теми же правами владения. Исходный лист и его хиты не изменятся. Попросите игрока описать тёплое воспоминание и его утрату.</p>${select('actor','Кто попал в котёл',actors.map(a=>[a.id,a.name]),actors[0].id)}`,'Создать призрака');if(!f)return;
  const actor=game.actors.get(f.get('actor')),template=moduleActor('player-ghost');if(!template)throw new Error('Не найден шаблон призрака.');
  const data=clone(template.toObject());delete data._id;data.name=`Призрак · ${actor.name}`;data.prototypeToken.name=data.name;data.ownership=clone(actor.ownership);data.flags={[ID]:{ghostOf:actor.id}};
  const ghost=await CONFIG.Actor.documentClass.create(data);s.victims.push({actorId:actor.id,ghostId:ghost.id,round:s.round});await save(s);
  await ghost.sheet.render(true);await whisper('<p>Призрак создан. Перетащите его к судейскому столу и откройте доступ игроку. Возврат воспоминания не воскрешает персонажа; при верном супе на рассвете восстановите 1 хит и добавьте одну степень истощения на исходном листе.</p>');
 }
 async loss(){
  const s=state(),options=Object.entries(s.teams).flatMap(([key,t])=>t.members.map(m=>[`${key}:${m}`,`${t.name} · ${moduleActor(m)?.name??m}`]));if(!options.length)return;
  const f=await ask('Потеря команды-соперника',select('member','Кто попал в котёл',options,options[0][0]),'Отметить потерю');if(!f)return;
  const [team,member]=f.get('member').split(':');s.teams[team].members=s.teams[team].members.filter(m=>m!==member);await save(s);
  // Keep the scene's NPCs in sync, without destroying their sheets or tokens.
  for(const scene of game.scenes){
   if(!scene.getFlag(ID,'key'))continue;
   const tokens=scene.tokens.filter(t=>t.actorId===moduleActor(member)?.id);
   if(tokens.length)await scene.updateEmbeddedDocuments('Token',tokens.map(t=>({_id:t.id,hidden:true,[`flags.${ID}.disabled`]:true})));
  }
 }
 async lair(){
  const s=state(),choices=[['knives','Ножи · до 3 атак +5 / 1d8'],['tilt','Крен · Сила Сл 13'],['steam','Пар · радиус 20 фт.']].filter(([k])=>k!==s.lairLast);
  const f=await ask('Действие логова',`<p>Только в бою со Шкваркой, на инициативе 20 после равных. Одно действие нельзя повторять два раунда подряд. Последнее действие: ${e(s.lairLast||'нет')}.</p>${select('lair','Действие',choices,choices[0][0])}`,'Показать напоминание');if(!f)return;
  s.lairLast=f.get('lair');await save(s);
  const text={knives:'Ножи: три отдельные атаки, +5 к попаданию, 1d8 рубящего. До трёх видимых целей. Кнопка атаки есть в листе Шкварки.',tilt:'Крен: все в 20 фт. от котла — Сила Сл 13. Провал: 10 фт. к котлу и сбивание с ног. Попавшие в котёл падают внутрь.',steam:'Пар: радиус 20 фт. с центром на котле сильно заслонён до инициативы 20 следующего раунда.'}[s.lairLast];
  await whisper(`<h3>Логово Шкварки</h3><p>${text}</p><p>Область, броски и состояния примените средствами Foundry.</p>`);
 }
 async boss(){
  const s=state(),scene=moduleScene('kitchen');if(!scene)throw new Error('Приключение не импортировано.');
  const old=game.combats.find(c=>c.scene?.id===scene.id&&c.getFlag(ID,'boss'));if(old){await scene.activate();await scene.view();await old.activate();ui.notifications.info('Бой со Шкваркой уже создан. Хиты сохранены.');return;}
  await this.placeParty(scene,s,true);await scene.activate();await scene.view();
  const boss=scene.tokens.find(t=>t.actorId===moduleActor('witch')?.id);if(!boss)throw new Error('Токен Шкварки не найден.');
  const hp=hagHP(s.size,s.level);await boss.update({disposition:-1});await boss.actor.update({'system.attributes.hp.max':hp,'system.attributes.hp.value':hp});
  const combat=await CONFIG.Combat.documentClass.create({scene:scene.id,active:true,flags:{[ID]:{boss:true}}});
  const ts=scene.tokens.filter(t=>t.id===boss.id||(t.getFlag(ID,'party')&&!s.victims.some(v=>v.actorId===t.actorId)));
  await combat.createEmbeddedDocuments('Combatant',ts.map(t=>({actorId:t.actorId,tokenId:t.id,sceneId:scene.id})));
  await combat.activate();await whisper(`<p>Бой со Шкваркой: ${hp} хитов. Бросьте инициативу. Действия логова на инициативе 20 после равных. Ножи, Крен и Пар нельзя повторять подряд.</p>`);
 }
}

Hooks.once('init',()=>{
 game.settings.register(ID,'tournament',{scope:'world',config:false,type:Object,default:initial(),onChange:()=>{if(panel?.rendered)panel.render(false);}});
 game.settings.register(ID,'welcomeSeen',{scope:'client',config:false,type:Boolean,default:false});
 game.settings.registerMenu(ID,'panel',{name:'Тот Самый Суп',label:'Открыть панель ведущего',hint:'Туры, ингредиенты, готовка и сцены приключения.',icon:'fas fa-utensils',type:SoupPanel,restricted:true});
 game.modules.get(ID).api={openPanel,openGuide,openImport,diagnose};
});
Hooks.once('ready',async()=>{
 if(!game.user.isGM||game.system.id!=='dnd5e')return;
 try{
  await loadIndex();
  if(!game.settings.get(ID,'welcomeSeen')){
   await whisper(`<h3>Тот Самый Суп</h3><p>Откройте «Компендии → Тот Самый Суп · Приключение» и импортируйте приключение. Затем откройте журнал «00 · Начните здесь» или макрос «Панель ведущего». Панель также доступна в настройках модуля.</p><p>Сборка рассчитана на Foundry 14.369 и dnd5e 6.0.0. Проверка в работающем Foundry доступна кнопкой «Диагностика».</p>`);
   await game.settings.set(ID,'welcomeSeen',true);
  }
 }catch(error){notifyError(error);}
});
Hooks.on('updateCombat',async(combat,change)=>{
 if(!game.user.isGM||game.users.activeGM?.id!==game.user.id||!combat.getFlag(ID,'timer')||combat.getFlag(ID,'expired'))return;
 if(change.round!==undefined&&combat.round>=11){
  await combat.setFlag(ID,'expired',true);
  ui.notifications.warn('Песок кончился: десять раундов охоты завершены. Оставшиеся ингредиенты замирают.');
  await whisper('<p><strong>Песок кончился.</strong> Завершены 10 раундов. Остановите охоту: все оставшиеся ингредиенты замирают. Ведущий завершает бой обычным способом.</p>');
 }
});

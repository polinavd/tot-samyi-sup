import {spoilage,cooking,finalVerdict,rankTeams,scaledRoster,hagHP,judgeDish,npcDish} from './rules.mjs';
import {tokenPlacement,compatibilityIssue} from './compat.mjs';
const ID='tot-samyi-sup', BASE=`modules/${ID}`;
let index, panel;
const clone=o=>foundry.utils.deepClone(o);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gm=()=>{if(!game.user.isGM)throw new Error('Доступно только ведущему.');};
const users=()=>game.users.filter(u=>u.isGM).map(u=>u.id);
const whisper=content=>CONFIG.ChatMessage.documentClass.create({content:`<div class="tss-chat">${content}</div>`,whisper:users()});
const initial=()=>({round:1,size:4,level:4,partyIds:[],ingredients:[],results:[],retried:false,victims:[],lairLast:'',heroTeams:{},rivalChanges:{},tempUses:{},teams:{sugar:{name:'Жжёный сахар',members:['mirta','pyshka']},spoons:{name:'Две ложки',members:['groh','shpyn']},brothers:{name:'Братство святого Кабачка',members:['goroh','fasol']}}});
const state=()=>{const s=clone(game.settings.get(ID,'tournament'));s.heroTeams??={};s.rivalChanges??={};s.tempUses??={};for(const i of s.ingredients){if(i.owner==='rivals'){i.owner='spoons';i.stolen=true;}}for(const r of s.results)r.team??='heroes';return s;};
const save=s=>game.settings.set(ID,'tournament',s);
const ingredientKey=t=>t?.getFlag(ID,'ingredient')??t?.actor?.getFlag(ID,'ingredient');
const moduleActor=key=>game.actors.get(index.actors[key])??game.actors.find(a=>a.getFlag(ID,'key')===key);
const moduleScene=key=>game.scenes.get(index.scenes[key])??game.scenes.find(s=>s.getFlag(ID,'key')===key);
const party=(s,team=null)=>s.partyIds.map(id=>game.actors.get(id)).filter(a=>a&&!s.victims.some(v=>v.actorId===a.id)&&(!team||(s.heroTeams[a.id]??'heroes')===team));
const teamName=(s,key)=>key==='heroes'?'Персонажи':s.teams[key]?.name??key;
const owners=s=>[['floor','На полу'],['heroes','У прежней команды героев'],...Object.entries(s.teams).map(([k,t])=>[k,t.name])];
const pcTeams=s=>[...new Set(s.partyIds.map(id=>s.heroTeams[id]??'heroes'))].filter(k=>party(s,k).length||s.teams[k]?.members.length);
const aliveSize=s=>s.partyIds.length?Math.min(s.size,party(s).length):s.size;
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
  return {round:s.round,roundName:['','Закуска','Горячее','Финал — Суп'][s.round],size:s.size,level:s.level,round1:s.round===1,round2:s.round===2,round3:s.round===3,duo:s.size===2,small:s.size===3,normal:s.size===4,large:s.size===5,level4:s.level===4,level5:s.level===5,
   characters:game.actors.filter(a=>a.type==='character').map(a=>({id:a.id,name:a.name,selected:s.partyIds.includes(a.id)})),
   ingredients:roundRows.map(i=>({...i,condition:i.spoiled?'Испорчено':'Годное',ownerName:i.owner==='floor'?'На полу':teamName(s,i.owner),floor:i.owner==='floor',heroes:i.owner==='heroes',rivals:i.owner==='rivals'})),
   results:s.results.map(r=>({round:r.round,total:r.total,result:r.label})),hasResults:s.results.length>0,
   teams:Object.entries(s.teams).map(([k,t])=>({key:k,name:t.name,count:t.members.length+party(s,k).length})),victims:s.victims.map(v=>({name:game.actors.get(v.actorId)?.name??v.actorId})),hasVictims:s.victims.length>0,retried:s.retried,
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
  if(command==='spoil')return this.spoil();
  if(command==='transfer')return this.transfer();
  if(command==='stock')return this.stock();
  if(command==='smuggle')return this.smuggle();
  if(command==='presentation')return this.presentation();
  if(command==='rivals')return this.rivals();
  if(command==='judge')return this.judge(state());
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
  if(![1,2,3].includes(s.round)||![2,3,4,5].includes(s.size)||![4,5].includes(s.level))throw new Error('Некорректная настройка тура.');
  if(s.partyIds.length&&s.partyIds.length!==s.size)ui.notifications.warn('Сложность не превышает поле «Живых бойцов»; отмеченные души не считаются бойцами. Проверьте размер группы и выбранные листы.');
  await save(s);ui.notifications.info('Настройки турнира сохранены.');
 }
 async prepare(){
  const s=state(),scene=moduleScene('kitchen');if(!scene)throw new Error('Сначала импортируйте приключение из компендия.');
  if(!s.partyIds.length)throw new Error('Сначала выберите персонажей и сохраните настройки.');
  await this.placeParty(scene,s,true);
  await scene.setFlag(ID,'round',s.round);
  await scene.activate();await scene.view();
  const roster=scaledRoster(s.round,Math.max(2,aliveSize(s)),s.level),counts=new Map();
  for(const key of roster)counts.set(key,(counts.get(key)??0)+1);
  const list=[...counts].map(([key,n])=>`${e(moduleActor(key)?.name??key)} × ${n}`).join('; ');
  await whisper(`<h3>Тур ${s.round} · главная карта</h3><p>Расставьте ингредиенты вручную из папки существ: ${list}. При смене тура уберите оставшиеся токены ингредиентов предыдущего тура. Расстановка и хиты существ автоматически не сбрасываются.</p><p>Охота длится до 10 раундов, можно уйти раньше с добычей. После времени недобытое становится несъедобными муляжами. ${s.round===3?'Капуста — ложный след. Скройте кость; колобок достигает лаза на третьем ходу. Не более двух раз на инициативе 20 — 10 временных хитов одному ингредиенту, кроме лука. При двух живых героях уменьшите хиты лозы до 21.':''}</p>`);
 }
 async placeParty(scene,s,kitchen=false){
  const positions=kitchen?[{x:3750,y:1900},{x:3850,y:2000},{x:3650,y:2000},{x:3950,y:1900},{x:3550,y:1900}]:scene.getFlag(ID,'partyPositions');
  const create=[];let i=0;
  for(const a of party(s)){
   if(scene.tokens.some(t=>t.actorId===a.id&&t.getFlag(ID,'party')))continue;
   const t=clone(a.prototypeToken.toObject());delete t._id;
   const p=positions[i++%positions.length];create.push({...t,actorId:a.id,actorLink:true,x:p.x,y:p.y,...tokenPlacement(scene,game.release.generation),disposition:1,hidden:false,flags:{[ID]:{party:true}}});
  }
  if(create.length)await scene.createEmbeddedDocuments('Token',create);
 }
 async combat(){
  const s=state(),scene=moduleScene('kitchen');if(!scene||canvas.scene?.id!==scene.id||scene.getFlag(ID,'round')!==s.round)throw new Error('Сначала подготовьте сцену текущего тура.');
  const existing=game.combats.find(c=>c.scene?.id===scene.id&&c.getFlag(ID,'round')===s.round);
  if(existing){await existing.activate();ui.notifications.info('Бой этого тура уже существует. Откройте его в трекере.');return;}
  const tokens=scene.tokens.filter(t=>!t.getFlag(ID,'disabled')&&(ingredientKey(t)||t.getFlag(ID,'party')||(s.round===2&&['groh','shpyn'].includes(t.actor?.getFlag(ID,'key')))));
  const c=await CONFIG.Combat.documentClass.create({scene:scene.id,active:true,flags:{[ID]:{round:s.round,timer:true,expired:false}}});
  await c.createEmbeddedDocuments('Combatant',tokens.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId,hidden:t.hidden})));
  await c.activate();ui.notifications.info('Бой создан. Бросьте инициативу и начните бой обычной кнопкой.');
 }
 async harvest(){
  const s=state(),t=canvas.tokens.controlled[0]?.document;
  if(!ingredientKey(t))throw new Error('Выберите один токен ингредиента на текущей сцене.');
  if(canvas.tokens.controlled.length!==1)throw new Error('Выберите ровно один токен ингредиента.');
  if(t.getFlag(ID,'disabled'))throw new Error('Этот ингредиент выключен настройкой сложности.');
  if(canvas.scene?.getFlag(ID,'round')!==s.round)throw new Error('Текущая сцена не соответствует выбранному туру.');
  if(t.getFlag(ID,'inedible'))throw new Error('Время охоты вышло: это несъедобный муляж.');
  if(s.ingredients.some(i=>i.tokenUuid===t.uuid))throw new Error('Состояние этого ингредиента уже зафиксировано. Для добытого продукта используйте кнопки владельца или порчи.');
  const hp=t.actor.system.attributes.hp;
  const f=await ask('Добивающий удар',`<p><strong>${e(t.name)}</strong>. Введите хиты <em>до</em> добивающего удара, включая временные. Урон — фактически нанесённый после сопротивлений и иммунитетов. Для смешанного удара отметьте все нанесённые типы порчи.</p>${number('remaining','Хиты + временные до удара',Math.max(1,hp.value+(hp.temp??0)),1)}${number('damage','Фактический урон добивающего удара',Math.max(1,hp.value+(hp.temp??0)),1)}${check('acid','Удар содержит урон кислотой')}${check('necrotic','Удар содержит некротический урон')}${check('poison','Удар содержит урон ядом')}${select('owner','После удара ингредиент…',owners(s),'floor')}`,'Зафиксировать');
  if(!f)return;
  const key=ingredientKey(t),spoiled=spoilage({remaining:Number(f.get('remaining')),damage:Number(f.get('damage')),types:['acid','necrotic','poison'].filter(k=>f.has(k)),alwaysSpoiled:key==='bone'});
  const row={id:foundry.utils.randomID(),tokenUuid:t.uuid,key,name:t.name,spoiled,owner:f.get('owner'),round:s.round,stolen:f.get('owner')==='spoons'};
  // Persist the ledger first. If a token update fails the authoritative result is not lost.
  s.ingredients.push(row);await save(s);
  await t.setFlag(ID,'harvested',true);await t.actor.update({'system.attributes.hp.value':0,'system.attributes.hp.temp':0});
  await whisper(`<p>${e(t.name)}: <strong>${spoiled?'испорчено':'годное'}</strong>. Состояние зафиксировано. Подбор требует обычного взаимодействия с предметом в 5 фт.; ведущий проверяет дистанцию.</p>`);
 }
 async owner(id){
  const s=state(),i=s.ingredients.find(i=>i.id===id);if(!i)return;
  if(s.results.some(r=>r.round===s.round&&r.ingredients.includes(id)))throw new Error('Продукт уже использован в поданном блюде. Сначала исправьте соответствующую оценку.');
  const f=await ask('Кто подобрал ингредиент',`<p>${e(i.name)} · ${i.spoiled?'испорчено':'годное'}. Меняется только владелец. Проверьте взаимодействие с предметом и дистанцию 5 фт.</p>${select('owner','Где продукт',owners(s),i.owner)}`,'Сохранить');
  if(f){i.stolen=i.stolen||(f.get('owner')==='spoons'&&i.owner!=='spoons'&&!i.supplied);i.owner=f.get('owner');await save(s);}
 }
 async cook(){
  const s=state(),required=s.round===3?4:3;
  let teams=pcTeams(s);if(!party(s).length)teams=Object.keys(s.teams).filter(k=>s.teams[k].members.length);
  if(!teams.length)throw new Error('Нужен живой повар: герой или согласный соперник.');
  let team=teams[0];
  if(teams.length>1){const f=await ask('Команда повара',select('team','Команда',teams.map(k=>[k,teamName(s,k)]),team));if(!f)return;team=f.get('team');}
  const stock=s.ingredients.filter(i=>i.round===s.round&&i.owner===team);
  const prior=s.results.filter(r=>r.round===s.round&&r.team===team);
  if(prior.length&&(s.round<3||!prior.at(-1).label.startsWith('«Почти»')))throw new Error('Этот тур уже оценён для команды. Используйте «Исправить последнюю оценку».');
  const cooks=[...party(s,team),...(s.teams[team]?.members??[]).map(moduleActor).filter(Boolean)];
  if(!cooks.length)throw new Error('Нет живого повара в команде.');
  const f=await ask('Готовка · '+teamName(s,team),`<p>Выберите до ${required} продуктов: −2 за испорченный и недостающий. Владение инструментами повара укажите в листе. Продукты новой команды внесите кнопкой «Запас команды».</p>${select('cook','Повар',cooks.map(a=>[a.id,a.name]),cooks[0].id)}<fieldset>${stock.map(i=>check('ing-'+i.id,i.name+' · '+(i.spoiled?'испорчено':'годное'),stock.length<=required)).join('')}</fieldset>${check('help','Помощь — преимущество')}${s.round===2?check('broth','Принят бульон — +2'):''}${check('seeds','Добавлены годные тыквенные семечки')}${check('intentional','Намеренный провал без броска')}`,'Приготовить');
  if(!f)return;const chosen=stock.filter(i=>f.has('ing-'+i.id));if(chosen.length>required)throw new Error('Выбрано слишком много продуктов.');
  if(s.round===3&&prior.length&&chosen.map(i=>i.id).sort().join()!==[...prior[0].ingredients].sort().join())throw new Error('Повторная готовка — только из тех же продуктов.');
  const actor=cooks.find(a=>a.id===f.get('cook'));if(!actor)throw new Error('Повар не состоит в выбранной команде.');
  const result=cooking({ingredients:chosen,required,wisdom:0,intentional:f.has('intentional')});const broth=s.round===2&&f.has('broth');
  if(!f.has('intentional')){
   const rolls=await actor.rollToolCheck({tool:'cook',ability:'wis',bonus:String((broth?2:0)-result.penalty),...(f.has('help')?{advantage:true}:{}),target:13},{options:{chooseAbility:false}},{data:{flavor:'Готовка · '+teamName(s,team)+' · Сл 13'}});
   if(!rolls?.length)return;result.total=rolls[0].total;result.success=result.total>=13;
  }
  let label=result.success?'Блюдо удалось':'Блюдо не удалось';
  if(s.round===3){const v=finalVerdict(chosen,result.success,prior.some(r=>r.label.startsWith('«Почти»')));label={win:'Правильный суп — договор разорван',retry:'«Почти» — одна повторная готовка',fight:'«Не то» — бой со Шкваркой'}[v];}
  const score=s.round<3?judgeDish({total:result.total,ingredients:chosen,broth,seeds:f.has('seeds')}):{};
  s.results.push({...result,...score,team,broth,seeds:f.has('seeds'),round:s.round,label,cook:actor.id,ingredients:chosen.map(i=>i.id),chosen:clone(chosen)});await save(s);
  await whisper(`<h3>${e(teamName(s,team))} · ${e(label)}</h3><p>Готовка ${result.total}. ${s.round<3?'Оценки: '+score.judges.join(' / ')+'. Представьте удавшееся блюдо кнопкой презентации.':'Опросите обе команды с героями до наказания: любой верный суп разрывает договор для всех.'}</p>`);
  if(s.round<3)await this.judge(s);
 }

 async judge(s){
  if(s.round===3)throw new Error('В финале судит одна Шкварка; используйте исход готовки.');
  if(s.results.some(r=>r.round===s.round&&!r.judges))throw new Error('В учёте есть готовка из версии 1.3.1. Удалите старую оценку кнопкой исправления и повторите готовку по новым правилам, проверив бульон и семечки.');
  const teams=pcTeams(s),latest=k=>s.results.findLast(r=>r.round===s.round&&r.team===k);
  if(teams.some(k=>!latest(k))){await whisper('<p>До судейства приготовьте блюда всех команд с героями.</p>');return;}
  const rows=teams.map(k=>({...latest(k),key:k,name:teamName(s,k),heroes:true}));
  for(const [key,t] of Object.entries(s.teams)){
   if(!t.members.length||teams.includes(key))continue;
   const cooked=latest(key),changes=s.rivalChanges[`${s.round}:${key}`]??{};
   const stolen=s.ingredients.filter(i=>i.round===s.round&&i.owner===key&&i.stolen);
   rows.push({...cooked??npcDish(key,s.round,t.members.length,{...changes,stolen}),key,name:t.name,heroes:false});
  }
  let ranked=rankTeams(rows);const first=ranked[0];if(!first)return;
  const tied=rows.filter(t=>t.heroes&&t.score===first.score&&t.total===first.total&&t.defects===first.defects);
  if(first.heroes&&tied.length>1){
   let unique=false;
   while(!unique){for(const t of tied){const r=await new foundry.dice.Roll('1d6').evaluate();t.tieRoll=r.total;await r.toMessage({flavor:'Равенство команд · '+t.name});}const min=Math.min(...tied.map(t=>t.tieRoll));unique=tied.filter(t=>t.tieRoll===min).length===1;}
   ranked=rankTeams(rows);
  }
  await whisper(`<h3>Оценка тура ${s.round}</h3><p>${ranked.map(t=>`${e(t.name)}: ${t.judges.join('/')} + презентация ${t.presentation??0} = <b>${t.score}</b> (готовка ${t.total})`).join('<br>')}</p><p>С текущими оценками проигрывает <strong>${e(ranked[0].name)}</strong>. Сначала завершите презентации и поправки саботажа. После окончательной подачи выберите плату за минуту; при сопротивлении — инициатива до захвата.</p>`);
 }

 async tempHP(){
  const s=state(),t=canvas.tokens.controlled[0]?.document;
  const battle=game.combat?.id??'final';if((s.tempUses[battle]??0)>=2)throw new Error('«Аккуратнее!» уже использовано два раза за этот бой.');
  if(s.round!==3||!ingredientKey(t))throw new Error('В финале выберите токен ингредиента.');
  if(canvas.tokens.controlled.length!==1)throw new Error('Выберите ровно один токен.');
  if(ingredientKey(t)==='onion')throw new Error('Луковая стая не получает временные хиты.');
  if(t.getFlag(ID,'harvested')||t.getFlag(ID,'disabled'))throw new Error('Этот ингредиент уже собран или выключен.');
  await t.actor.update({'system.attributes.hp.temp':Math.max(10,t.actor.system.attributes.hp.temp??0)});
  s.tempUses[battle]=(s.tempUses[battle]??0)+1;await save(s);
  await whisper(`<p>«Аккуратнее!» ${e(t.name)} получает 10 временных хитов; они не складываются с уже имеющимися. Используйте на инициативе 20, проигрывая равенство.</p>`);
 }
 async cauldron(){
  const t=canvas.tokens.controlled[0];if(!t?.actor)throw new Error('Выберите токен жертвы в котле.');
  const r=await new foundry.dice.Roll('3d6').evaluate();await r.toMessage({flavor:`Большой котёл · ${e(t.name)} · урон огнём в конце хода жертвы.`});
  await whisper(`<p>К ${e(t.name)} нужно применить ${r.total} урона огнём с учётом сопротивлений. В котле существо опутано. Выход действием: Атлетика или Акробатика Сл 13. Союзник у края может действием вытащить Атлетикой Сл 13. При 0 хитах — обычные спасброски от смерти и лечение; душа появляется только после смерти. Применение урона и перемещение — средствами системы.</p>`);
 }
 async ghost(){
  const s=state(),actors=s.partyIds.map(id=>game.actors.get(id)).filter(a=>a&&!s.victims.some(v=>v.actorId===a.id));if(!actors.length)throw new Error('Нет персонажей, которых можно отметить попавшими в котёл.');
  const f=await ask('Персонаж попал в котёл',`<p>Создаётся отдельный лист призрака с теми же правами владения. Исходный лист и его хиты не изменятся. Попросите игрока описать тёплое воспоминание и его утрату.</p>${select('actor','Кто попал в котёл',actors.map(a=>[a.id,a.name]),actors[0].id)}`,'Создать призрака');if(!f)return;
  const actor=game.actors.get(f.get('actor')),template=moduleActor('player-ghost');if(!template)throw new Error('Не найден шаблон призрака.');
  const data=clone(template.toObject());delete data._id;data.name=`Призрак · ${actor.name}`;data.prototypeToken.name=data.name;data.ownership=clone(actor.ownership);data.flags={[ID]:{ghostOf:actor.id}};
  for(const key of ['int','wis','cha','dex'])data.system.abilities[key]={value:actor.system.abilities[key].value,proficient:actor.system.abilities[key].proficient??0};
  data.system.skills=clone(actor.toObject().system.skills??{});data.system.traits.languages=clone(actor.toObject().system.traits.languages);
  for(const [key,skill] of Object.entries(data.system.skills)){const live=actor.system.skills[key];if(live?.total!==undefined){skill.bonuses??={};skill.bonuses.check=String(live.total-(actor.system.abilities[live.ability]?.mod??0)-2*(skill.value??0));}}
  const ghost=await CONFIG.Actor.documentClass.create(data);s.victims.push({actorId:actor.id,ghostId:ghost.id,round:s.round});await save(s);
  await ghost.sheet.render(true);await whisper('<p>Призрак создан. Перетащите его на карту и добавьте в общую инициативу; владение игрока сохранено. Призрак летает по всему дому, сохраняет навыки и языки, действием использует Холодный совет или Полтергейст. Сверьте бонусы навыков с исходным листом, если у героя есть постоянные эффекты. Возврат воспоминания не воскрешает персонажа; при верном супе на рассвете восстановите 1 хит и добавьте одну степень истощения на исходном листе.</p>');
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
  const size=Math.max(2,aliveSize(s)),hp=hagHP(size,s.level);await boss.update({disposition:-1});await boss.actor.update({'system.attributes.hp.max':hp,'system.attributes.hp.value':hp});
  const combat=await CONFIG.Combat.documentClass.create({scene:scene.id,active:true,flags:{[ID]:{boss:true}}});
  const ts=scene.tokens.filter(t=>t.id===boss.id||(t.getFlag(ID,'party')&&!s.victims.some(v=>v.actorId===t.actorId)));
  await combat.createEmbeddedDocuments('Combatant',ts.map(t=>({actorId:t.actorId,tokenId:t.id,sceneId:scene.id})));
  await combat.activate();await whisper(`<p>Бой со Шкваркой: ${hp} хитов. ${size<=2?'Одна атака вместо Мультиатаки и один нож.':s.level>=5?'Одна легендарная устойчивость за бой и одно легендарное перемещение за раунд (без захваченной жертвы).':''} Бросьте инициативу. Действия логова на инициативе 20 после равных. Ножи, Крен и Пар нельзя повторять подряд.</p>`);
 }

 async spoil(){
  const s=state(),stock=s.ingredients.filter(i=>i.round===s.round&&!i.spoiled&&i.owner!=='floor'&&!s.results.some(r=>r.round===s.round&&r.ingredients.includes(i.id)));if(!stock.length)throw new Error('Нет годных добытых продуктов, ещё не использованных в блюде.');
  const f=await ask('Порча после охоты',`<p>Своё: кислота, яд, некротический урон либо минута у очага; расход ресурса обязателен. Чужое: одна попытка за тур, Скрытность Сл 13 или пассивная Внимательность героя. При провале порчи нет, расходники потрачены. Сначала разыграйте проверку и отвлечение; эта кнопка лишь фиксирует успешную порчу.</p>${select('id','Ингредиент',stock.map(i=>[i.id,i.name+' · '+teamName(s,i.owner)]),stock[0].id)}${check('confirmed','Условия и успешный саботаж (если нужен) проверены ведущим')}`,'Испортить');
  if(!f?.has('confirmed'))return;stock.find(i=>i.id===f.get('id')).spoiled=true;await save(s);await whisper('<p>Ингредиент испорчен после добычи. Исправить его нельзя. Для соперника с фиксированным результатом также внесите дефект в «Саботаж · поправки соперников».</p>');
 }
 async transfer(){
  const s=state(),actors=party(s).filter(a=>!s.heroTeams[a.id]);
  const vacancies=Object.entries(s.teams).filter(([k,t])=>t.members.length===1&&!Object.values(s.heroTeams).includes(k));
  if(!actors.length||!vacancies.length||party(s,'heroes').length<=1){await whisper('<p>Перевод невозможен или уже выполнен. Отберите один годный продукт; при отсутствии запретите помощь и презентацию. Если пойман в перерыве, наказание действует в следующем туре. Отметьте наказание вручную.</p>');return;}
  const f=await ask('В чужом фартуке',`<p>Перевод действует до конца турнира. Герой сохраняет волю; новые противники не добавляются. Приоритет вакансий: братья, ложки, сахар.</p>${select('actor','Нарушитель',actors.map(a=>[a.id,a.name]),actors[0].id)}${select('team','Новая команда',vacancies.sort((a,b)=>['brothers','spoons','sugar'].indexOf(a[0])-['brothers','spoons','sugar'].indexOf(b[0])).map(([k,t])=>[k,t.name]),vacancies[0][0])}`,'Перевести');
  if(!f)return;s.heroTeams[f.get('actor')]=f.get('team');await save(s);await whisper('<p>Герой переведён в '+e(teamName(s,f.get('team')))+'. Теперь у команды обычная проверка готовки. Внесите запас нового сокомандника отдельной кнопкой.</p>');
 }
 async stock(){
  const s=state(),teams=Object.keys(s.teams).filter(k=>s.teams[k].members.length);if(!teams.length)return;
  const f=await ask('Запас команды',`<p>Внести обычные продукты из дальней части кладовой один раз за тур. Используйте для команды переведённого героя или согласного повара, которому помогают души. Для остальных соперников достаточно фиксированных оценок.</p>${select('team','Команда',teams.map(k=>[k,teamName(s,k)]),teams[0])}`,'Внести');if(!f)return;
  const team=f.get('team');if(s.ingredients.some(i=>i.round===s.round&&i.owner===team&&i.supplied))throw new Error('Запас этой команды уже внесён.');
  const roster=s.round===3?['bone','bread','nettle','onion']:s.round===2&&team==='spoons'?['cabbage','cabbage']:team==='sugar'&&s.round===1?['pumpkin','cabbage','cabbage']:['cabbage','cabbage','cabbage'];
  for(const key of roster)s.ingredients.push({id:foundry.utils.randomID(),key,name:moduleActor(key)?.name??key,spoiled:key==='bone',owner:team,round:s.round,supplied:true});await save(s);
 }
 async smuggle(){
  const s=state(),actors=party(s).filter(a=>s.heroTeams[a.id]);if(!actors.length)throw new Error('Нет живого переведённого героя.');
  const f=await ask('Тайная передача',select('actor','Кто передаёт продукты прежней команде',actors.map(a=>[a.id,a.name]),actors[0].id));if(!f)return;
  const actor=actors.find(a=>a.id===f.get('actor')),team=s.heroTeams[actor.id];s.smuggled??={};const key=s.round+':'+actor.id;if(s.smuggled[key])throw new Error('Попытка передачи в этом туре уже была.');
  const stock=s.ingredients.filter(i=>i.round===s.round&&i.owner===team&&!s.results.some(r=>r.round===s.round&&r.ingredients.includes(i.id)));const g=await ask('Партия продуктов',stock.map(i=>check(i.id,i.name)).join(''),'Проверить Скрытность Сл 13');if(!g)return;
  const chosen=stock.filter(i=>g.has(i.id));if(!chosen.length)throw new Error('Выберите продукты.');
  const rolls=await actor.rollSkill({skill:'ste',target:13});if(!rolls?.length)return;s.smuggled[key]=true;if(rolls[0].total>=13)for(const i of chosen)i.owner='heroes';await save(s);
  await whisper('<p>'+e(actor.name)+': '+(rolls[0].total>=13?'продукты переданы прежней команде.':'новый сокомандник заметил передачу и удержал продукты. Повторной попытки нет.')+'</p>');
 }
 async presentation(){
  const s=state();if(s.round===3)throw new Error('Презентация не меняет финальный рецепт.');
  const results=s.results.filter(r=>r.round===s.round&&r.success&&r.judges&&!r.presented);if(!results.length)throw new Error('Нет удавшегося блюда новой редакции без завершённой презентации.');
  const f=await ask('Презентация блюда',`<p>Назовите блюдо и опишите подачу. Достаточно короткого замысла, красноречие игрока не требуется. Один бросок на команду.</p>${select('team','Чьё блюдо',results.map(r=>[r.team,teamName(s,r.team)]),results[0].team)}`);if(!f)return;
  const row=results.find(r=>r.team===f.get('team')),actors=[...party(s,row.team),...(s.teams[row.team]?.members??[]).map(moduleActor).filter(Boolean),...s.victims.filter(v=>(s.heroTeams[v.actorId]??'heroes')===row.team).map(v=>game.actors.get(v.ghostId)).filter(Boolean)];
  if(!actors.length)throw new Error('Нет представителя команды.');
  const g=await ask('Кто представляет блюдо',select('actor','Представитель',actors.map(a=>[a.id,a.name]),actors[0].id)+select('skill','Проверка',[['per','Убеждение'],['prf','Выступление']],'per'));if(!g)return;
  const actor=actors.find(a=>a.id===g.get('actor'));const rolls=await actor.rollSkill({skill:g.get('skill'),target:13,...(actor.getFlag(ID,'ghostOf')?{advantage:true}:{})});if(!rolls?.length)return;
  row.presented=true;Object.assign(row,judgeDish({total:row.total,ingredients:row.chosen,broth:row.broth,seeds:row.seeds,presentation:rolls[0].total>=13}));await save(s);await this.judge(s);
 }
 async rivals(){
  const s=state();if(s.round===3)throw new Error('В финале фиксированных оценок нет.');
  const teams=Object.entries(s.teams).filter(([,t])=>t.members.length);if(!teams.length)return;
  const f=await ask('Поправки соперников',`<p>Укажите только новые дефекты от саботажа/кражи выбранных продуктов. Недостача «Двух ложек» уже учтена. При годной замене из запаса штрафа нет. Бульон повторно не прибавляется.</p>${teams.map(([k,t])=>{const c=s.rivalChanges[`${s.round}:${k}`]??{};return `<fieldset><legend>${e(t.name)}</legend>${number(k+'-bad','Испорчено саботажем',c.spoiled??0,0,3)}${number(k+'-missing','Дополнительно не хватает',c.missing??0,0,3)}${check(k+'-fat','Годная жирная добавка утрачена',c.lostFat)}</fieldset>`;}).join('')}`,'Сохранить');if(!f)return;
  for(const [k] of teams){const spoiled=Number(f.get(k+'-bad')),missing=Number(f.get(k+'-missing'));if(spoiled+missing>3)throw new Error('В блюде не больше трёх дефектных мест.');s.rivalChanges[`${s.round}:${k}`]={spoiled,missing,lostFat:f.has(k+'-fat')};}await save(s);await this.judge(s);
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
  const issue=compatibilityIssue(game.version,game.system.version);
  if(issue){ui.notifications.error(issue,{permanent:true});return;}
  await loadIndex();
  if(!game.settings.get(ID,'welcomeSeen')){
   await whisper(`<h3>Тот Самый Суп</h3><p>Откройте «Компендии → Тот Самый Суп · Приключение» и импортируйте приключение. Затем откройте журнал «00 · Начните здесь» или макрос «Панель ведущего». Панель также доступна в настройках модуля.</p><p>Поддерживаемые связки: Foundry 13.351 / dnd5e 5.3.3 и Foundry 14 / dnd5e 5.3.3 или 6. Для Midi-QOL выберите версию по таблице в README. Проверка в работающем Foundry доступна кнопкой «Диагностика».</p>`);
   await game.settings.set(ID,'welcomeSeen',true);
  }
 }catch(error){notifyError(error);}
});
Hooks.on('updateCombat',async(combat,change)=>{
 if(!game.user.isGM||game.users.activeGM?.id!==game.user.id||!combat.getFlag(ID,'timer')||combat.getFlag(ID,'expired'))return;
 if(change.round!==undefined&&combat.round>=11){
  await combat.setFlag(ID,'expired',true);
  const tokens=combat.scene?.tokens?.filter(t=>ingredientKey(t)&&!t.getFlag(ID,'harvested'))??[];
  for(const t of tokens)await t.setFlag(ID,'inedible',true);
  ui.notifications.warn('Песок кончился: десять раундов охоты завершены. Остатки становятся несъедобными муляжами.');
  await whisper('<p><strong>Песок кончился.</strong> Завершены 10 раундов. Остановите охоту: все недобытые продукты становятся несъедобными муляжами и не могут попасть в блюдо. Ведущий завершает бой обычным способом.</p>');
 }
});

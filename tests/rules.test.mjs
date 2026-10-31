import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spoilage,cooking,finalVerdict,rankTeams,scaledRoster,hagHP,judgeDish,npcDish} from '../scripts/rules.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure.json',import.meta.url)));
const key=x=>x.flags?.['tot-samyi-sup']?.key;
test('spoiling boundary includes temporary HP and acid/poison/necrotic damage',()=>{
 assert(!spoilage({remaining:4,damage:13}));assert(spoilage({remaining:4,damage:14}));
 for(const t of ['acid','poison','necrotic'])assert(spoilage({remaining:9,damage:9,types:[t]}));
 assert.throws(()=>spoilage({remaining:10,damage:9}));
});
test('defects and broth are counted once; intentional failure is zero',()=>{
 assert.equal(cooking({ingredients:[{spoiled:true},{}],required:3,wisdom:2,proficiency:2,die:11,broth:true}).total,13);
 assert.equal(cooking({ingredients:[],required:4,wisdom:50,die:20,intentional:true}).total,0);
});
test('failed dishes receive only Darina point, presentation cannot rescue them',()=>{
 assert.deepEqual(judgeDish({total:12,ingredients:[{key:'ham'}],broth:true,presentation:1}),{judges:[0,0,1],score:1,presentation:0});
});
test('quality thresholds and tastes; presentation is one shared point',()=>{
 const ing=[{key:'pumpkin'},{key:'mandrake'},{key:'onion'}];
 assert.equal(judgeDish({total:13,ingredients:ing,seeds:true}).score,4);
 assert.equal(judgeDish({total:18,ingredients:ing,seeds:true,presentation:1}).score,7);
 assert.equal(judgeDish({total:18,ingredients:ing,seeds:true,broth:true,presentation:1}).score,7);
 assert.equal(judgeDish({total:13,ingredients:ing.map(i=>({...i,spoiled:true})),seeds:true}).score,2);
});
test('NPC examples agree with the manuscript, including both surviving brothers',()=>{
 assert.deepEqual(['sugar','spoons','brothers'].map(k=>npcDish(k,1,2).score),[4,3,1]);
 assert.deepEqual(['sugar','spoons','brothers'].map(k=>npcDish(k,2,1).score),[4,3,3]);
 assert.equal(npcDish('brothers',2,2).score,1);
 assert.equal(npcDish('sugar',1,2,{spoiled:1,lostFat:true}).score,2);
 assert.equal(npcDish('spoons',2,2,{spoiled:1}).total,11);
 assert.equal(npcDish('spoons',2,2,{spoiled:1}).score,1);
});
test('stolen good product fills gap; bad product does not satisfy Mosol',()=>{
 assert.equal(npcDish('spoons',2,2,{stolen:[{key:'ham',spoiled:false}]}).score,4);
 assert.equal(npcDish('spoons',2,2,{stolen:[{key:'ham',spoiled:true}]}).score,3);
 const t=[{key:'ham',spoiled:false}];npcDish('spoons',2,2,{stolen:t,spoiled:3});assert(!t[0].spoiled);
});
test('ranking uses judge sum, then cooking, then defects, then hag preference',()=>{
 const h={key:'heroes',heroes:true,score:3,total:19,defects:0};
 assert.equal(rankTeams([h,{key:'sugar',score:2,total:30,defects:0}])[0].key,'sugar');
 assert.equal(rankTeams([h,{key:'sugar',score:3,total:18,defects:0}])[0].key,'sugar');
 assert.equal(rankTeams([h,{key:'sugar',score:3,total:19,defects:1}])[0].key,'sugar');
 assert.equal(rankTeams([h,{key:'sugar',score:3,total:19,defects:0}])[0].key,'heroes');
 assert.equal(rankTeams(['brothers','sugar','spoons'].map(key=>({key,score:3,total:13,defects:0})))[0].key,'spoons');
 assert.equal(rankTeams([{...h,key:'sugar',tieRoll:4},{...h,tieRoll:2}])[0].key,'heroes');
});
test('rosters for each level and living party size match the new manuscript',()=>{
 assert.deepEqual(scaledRoster(1,2,4),['pumpkin','mandrake','onion']);
 assert.deepEqual(scaledRoster(2,2,5),['cabbage','cabbage','mandrake']);
 assert.equal(scaledRoster(1,3,4).length,4);assert.equal(scaledRoster(2,3,4).length,3);
 assert.equal(scaledRoster(1,4,4).filter(k=>k==='pumpkin').length,1);
 assert.equal(scaledRoster(1,5,4).filter(k=>k==='pumpkin').length,2);
 assert.equal(scaledRoster(1,3,5).filter(k=>k==='pumpkin').length,2);
 assert.equal(scaledRoster(1,4,5).filter(k=>k==='pumpkin').length,3);
 assert(scaledRoster(3,4,4).includes('cabbage'));
 assert.equal(scaledRoster(3,4,5).filter(k=>k==='onion').length,2);
});
test('boss HP table covers 2–5 living heroes at both levels',()=>{
 assert.deepEqual([2,3,4,5].map(n=>hagHP(n,4)),[60,90,112,140]);
 assert.deepEqual([2,3,4,5].map(n=>hagHP(n,5)),[90,120,150,180]);
});
test('cabbage is a red herring and final has exactly one retry per team',()=>{
 const soup=['bone','bread','nettle','onion'].map(key=>({key,spoiled:true}));
 assert.equal(finalVerdict(soup,false),'win');assert.equal(finalVerdict(soup,true),'retry');assert.equal(finalVerdict(soup,true,true),'fight');
 assert.equal(finalVerdict([...soup.slice(0,3),{key:'cabbage',spoiled:true}],false),'fight');
});
test('source, guide, handouts and monster sheets all expose current rules',()=>{
 const source=data.journal.find(j=>key(j)==='source').pages.map(p=>p.text.content).join(' ');
 for(const t of ['В чужом фартуке','несъедобные муляжи','чахлую, пожухлую','пригорелого хлеба','Собственное воспоминание','Вдохновение за эту сцену'])assert(source.includes(t),t);
 assert(!source.includes('Вернувшееся тепло'));
 const ghost=data.actors.find(a=>key(a)==='player-ghost');assert.equal(ghost.system.attributes.movement.fly,30);
 assert(ghost.items.some(i=>i.name==='Полтергейст'));assert(ghost.items.some(i=>i.name==='Холодный совет'));
 const witch=data.actors.find(a=>key(a)==='witch');assert(witch.items.find(i=>i.name==='Всё в котёл').system.description.value.includes('начале её текущего хода'));
 assert.equal(data.scenes.length,1);assert.equal(data.scenes[0].walls.length,20);assert.equal(data.scenes[0].lights.length,47);
});
test('module initializes and player access remains restricted',async()=>{
 const hooks=new Map(),settings=new Map();let Menu;
 globalThis.Hooks={once:(k,f)=>hooks.set(k,f),on:(k,f)=>hooks.set(k,f)};
 globalThis.foundry={utils:{deepClone:structuredClone,fetchJsonWithTimeout:async()=>JSON.parse(fs.readFileSync(new URL('../data/index.json',import.meta.url)))},applications:{api:{ApplicationV2:class{render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:C=>C}}};
 const mod={};globalThis.game={user:{isGM:false},modules:new Map([['tot-samyi-sup',mod]]),settings:{register:(id,k,c)=>settings.set(k,c.default),get:(id,k)=>settings.get(k),set:async(id,k,v)=>{settings.set(k,v);return v;},registerMenu:(id,k,c)=>Menu=c.type}};
 await import('../scripts/main.mjs');hooks.get('init')();await assert.rejects(mod.api.openPanel(),/только ведущему/);
 game.user.isGM=true;game.actors=Object.assign([],{get:()=>null});game.journal=new Map();game.users=[];
 await mod.api.openPanel();assert.equal((await new Menu()._prepareContext()).round,1);
 const messages=[];globalThis.CONFIG={ChatMessage:{documentClass:{create:async m=>messages.push(m)}}};
 const hero={id:'hero',name:'Герой',type:'character',rollToolCheck:async()=>[{total:14}],rollSkill:async()=>[{total:13}],getFlag:()=>false};game.actors.get=id=>id==='hero'?hero:null;
 const s=settings.get('tournament');s.round=1;s.partyIds=['hero'];s.ingredients=['pumpkin','mandrake','onion'].map((key,i)=>({id:String(i),key,name:key,round:1,owner:'heroes',spoiled:false}));
 foundry.applications.api.DialogV2={prompt:async()=>{const f=new FormData();for(const k of ['ing-0','ing-1','ing-2','seeds'])f.set(k,'on');f.set('cook','hero');return f;}};
 const panel=new Menu();await panel.cook();assert.equal(settings.get('tournament').results[0].score,4);
 await assert.rejects(panel.cook(),/уже оценён/);
 foundry.applications.api.DialogV2.prompt=async()=>{const f=new FormData();f.set('team','heroes');f.set('actor','hero');f.set('skill','per');return f;};
 await panel.presentation();assert.equal(settings.get('tournament').results[0].score,5);assert(settings.get('tournament').results[0].presented);
 await assert.rejects(panel.presentation(),/Нет удавшегося/);
 assert(messages.some(m=>m.content.includes('Оценка тура 1')));
 // A transfer changes the actual team, its stock and cooking ownership.
 foundry.utils.randomID=(()=>{let i=0;return()=>`test${++i}`;})();
 const other={...hero,id:'other',name:'Другой герой'};
 const fasol={...hero,id:'fasol',name:'Фасоль'};
 const index=JSON.parse(fs.readFileSync(new URL('../data/index.json',import.meta.url)));
 game.actors.get=id=>id==='hero'?hero:id==='other'?other:id===index.actors.fasol?fasol:null;
 let current=settings.get('tournament');current.partyIds=['hero','other'];current.teams.brothers.members=['fasol'];
 foundry.applications.api.DialogV2.prompt=async()=>{const f=new FormData();f.set('actor','hero');f.set('team','brothers');return f;};
 await panel.transfer();assert.equal(settings.get('tournament').heroTeams.hero,'brothers');
 current=settings.get('tournament');current.round=3;
 await panel.stock();assert.equal(settings.get('tournament').ingredients.filter(i=>i.round===3&&i.owner==='brothers').length,4);
 await assert.rejects(panel.stock(),/уже внесён/);
 // One successful stealth check moves the chosen party of products once.
 const batch=settings.get('tournament').ingredients.filter(i=>i.round===3&&i.owner==='brothers');
 foundry.applications.api.DialogV2.prompt=async()=>{const f=new FormData();f.set('actor','hero');for(const i of batch)f.set(i.id,'on');return f;};
 await panel.smuggle();assert(batch.every(i=>settings.get('tournament').ingredients.find(x=>x.id===i.id).owner==='heroes'));
 await assert.rejects(panel.smuggle(),/уже была/);
 // Final protection is capped at two uses and onion is never eligible.
 let temp=0;const token={name:'Хлеб',getFlag:(id,k)=>k==='ingredient'?'bread':false,actor:{system:{attributes:{hp:{temp:0}}},update:async()=>{temp++;}}};
 globalThis.canvas={tokens:{controlled:[{document:token}]}};game.combat={id:'hunt'};
 await panel.tempHP();await panel.tempHP();await assert.rejects(panel.tempHP(),/два раза/);assert.equal(temp,2);
 // Cauldron damage explicitly occurs at the end of the victim turn.
 let flavor='';foundry.dice={Roll:class{async evaluate(){this.total=10;return this;}async toMessage(o){flavor=o.flavor;}}};
 canvas.tokens.controlled=[{name:'Герой',actor:hero}];await panel.cauldron();assert(flavor.includes('в конце хода'));
 assert(messages.at(-1).content.includes('обычные спасброски от смерти'));
});

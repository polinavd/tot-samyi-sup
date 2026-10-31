/** Pure tournament rules; no Foundry globals and no combat patches. */
export function spoilage({remaining, damage, types=[], alwaysSpoiled=false}) {
  if (!Number.isFinite(remaining) || remaining<=0 || !Number.isFinite(damage) || damage<remaining) {
    throw new Error('Введите положительные хиты до удара и фактический добивающий урон не меньше этих хитов. Временные хиты входят в остаток.');
  }
  return alwaysSpoiled || damage-remaining>=10 || types.some(t=>['acid','necrotic','poison'].includes(t));
}
export function cooking({ingredients,required,wisdom,proficiency=0,broth=false,die=0,intentional=false}) {
  if (ingredients.length>required) throw new Error(`Для блюда выберите не больше ${required} ингредиентов.`);
  const spoiled=ingredients.filter(i=>i.spoiled).length;
  const missing=Math.max(0,required-ingredients.length);
  const penalty=2*(spoiled+missing);
  const total=intentional?0:die+wisdom+proficiency+(broth?2:0)-penalty;
  return {total,spoiled,missing,defects:spoiled+missing,penalty,success:!intentional&&total>=13,intentional};
}
export function finalVerdict(ingredients,success,retried=false) {
  const perfect=ingredients.length===4&&new Set(ingredients.map(i=>i.key)).size===4
    &&['bone','bread','nettle','onion'].every(k=>ingredients.some(i=>i.key===k&&i.spoiled));
  if (perfect&&!success) return 'win';
  if (perfect&&success&&!retried) return 'retry';
  return 'fight';
}
export function rankTeams(teams) {
  const order={spoons:0,sugar:1,brothers:2};
  return [...teams].sort((a,b)=>(a.score??0)-(b.score??0)||a.total-b.total || b.defects-a.defects || Number(Boolean(b.heroes))-Number(Boolean(a.heroes)) || (a.heroes&&b.heroes?(a.tieRoll??0)-(b.tieRoll??0):0) || (order[a.key]??3)-(order[b.key]??3));
}
export function scaledRoster(round,partySize,level) {
  const rows={1:['pumpkin','pumpkin','mandrake','mandrake','mandrake','onion'],2:['ham','cabbage','cabbage','cabbage'],3:['bone','bread','nettle','cabbage','onion']};
  const result=[...rows[round]];
  if(partySize<=2&&round===1)return ['pumpkin','mandrake','onion'];
  if(partySize<=2&&round===2)return ['cabbage','cabbage','mandrake'];
  if(level===4&&partySize<=4&&round===1)result.splice(result.indexOf('pumpkin'),1);
  if(level===4&&partySize<=3&&round<3)result.splice(result.lastIndexOf(round===1?'mandrake':'cabbage'),1);
  if(level>=5&&partySize>=4)result.push(round===3?'onion':'pumpkin');
  return result;
}
export function hagHP(partySize,level) {
  if(partySize<=2)return level>=5?90:60;
  return (level>=5?{3:120,4:150,5:180}:{3:90,4:112,5:140})[Math.min(5,partySize)];
}
export function judgeDish({total,ingredients=[],broth=false,seeds=false,presentation=0}){
 const quality=total>=18?2:total>=13?1:0;
 if(!quality)return {judges:[0,0,1],score:1,presentation:0};
 const fat=broth||ingredients.some(i=>!i.spoiled&&(i.key==='ham'||(seeds&&i.key==='pumpkin')));
 const full=ingredients.length===3&&ingredients.every(i=>!i.spoiled);
 const judges=[quality+Number(fat),quality+Number(full),0];
 const bonus=Number(Boolean(presentation));
 return {judges,score:judges.reduce((a,b)=>a+b,0)+bonus,presentation:bonus};
}
export function npcDish(key,round,members,{stolen=[],spoiled=0,missing=0,lostFat=false}={}){
 let total=key==='sugar'?15:key==='spoons'?13+(round===2?2*stolen.length:0):round===2&&members===1?16:10;
 const stock=Array.from({length:3},(_,n)=>({key:n===0&&key==='sugar'&&round===1?'pumpkin':'cabbage',spoiled:false}));
 if(key==='spoons'&&round===2){stock.pop();if(stolen.length)stock.push({...stolen.find(i=>!i.spoiled)??stolen[0]});}
 for(let n=0;n<Math.min(spoiled,stock.length);n++)stock[n].spoiled=true;
 stock.splice(Math.max(0,stock.length-missing));
 total-=2*(spoiled+missing);
 const broth=round===2&&key!=='brothers';
 const j=judgeDish({total,ingredients:stock,broth,seeds:!lostFat});
 return {...j,total,defects:stock.filter(i=>i.spoiled).length+3-stock.length};
}

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
  return [...teams].sort((a,b)=>a.total-b.total || b.defects-a.defects || Number(Boolean(b.heroes))-Number(Boolean(a.heroes)) || a.name.localeCompare(b.name,'ru'));
}
export function scaledRoster(round,partySize,level) {
  const rows={1:['pumpkin','pumpkin','mandrake','mandrake','mandrake','onion'],2:['ham','cabbage','cabbage','cabbage'],3:['bone','bread','nettle','onion']};
  const result=[...rows[round]];
  if (partySize<=3&&round<3) result.splice(result.lastIndexOf(round===1?'mandrake':'cabbage'),1);
  if ((partySize>=5||level>=5)) result.push(round===3?'onion':'pumpkin');
  return result;
}
export function hagHP(partySize,level) {
  return (partySize>=5||level>=5)?140:partySize<=3?90:112;
}

const KEY='hub_progress_v1';
const EMPTY=()=>({games:{},daily:{lastDate:null,streak:0}});

function storage(){try{return globalThis.localStorage||null}catch{return null}}
export function readProgress(){
  const s=storage(); if(!s)return EMPTY();
  try{
    const v=JSON.parse(s.getItem(KEY)||'null');
    if(!v||typeof v!=='object')return EMPTY();
    return {games:v.games&&typeof v.games==='object'?v.games:{},daily:v.daily&&typeof v.daily==='object'?v.daily:{lastDate:null,streak:0}};
  }catch{return EMPTY()}
}
function writeProgress(v){const s=storage();if(!s)return;try{s.setItem(KEY,JSON.stringify(v))}catch{}}

export function isBetterScore(score,best,higherIsBetter=true){
  if(!Number.isFinite(score))return false;
  if(best==null||!Number.isFinite(Number(best)))return true;
  return higherIsBetter?score>Number(best):score<Number(best);
}
function dayNumber(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3])/86400000:null}
export function nextDailyStreak(lastDate,currentStreak,today){
  if(lastDate===today)return Math.max(0,Number(currentStreak)||0);
  const a=dayNumber(lastDate),b=dayNumber(today);
  return a!=null&&b!=null&&b-a===1?Math.max(0,Number(currentStreak)||0)+1:1;
}
export function getGameProgress(id){const p=readProgress();return p.games[id]||{best:null,plays:0,lastPlayed:null}}
export function getSummary(today){
  const p=readProgress(); const entries=Object.values(p.games);
  return {finishes:entries.reduce((n,g)=>n+(Number(g.plays)||0),0),records:entries.filter((g)=>g.best!=null).length,streak:Number(p.daily.streak)||0,completedToday:p.daily.lastDate===today};
}
export function recordFinish(game,rawScore,today){
  const score=Number(rawScore); if(!game||!Number.isFinite(score))return {newBest:false,best:null,dailyAdvanced:false,streak:0};
  const p=readProgress(); const old=p.games[game.id]||{best:null,plays:0,lastPlayed:null};
  const higher=game.cfg?.higherIsBetter!==false; const newBest=isBetterScore(score,old.best,higher);
  const best=newBest?score:old.best;
  p.games[game.id]={best,plays:(Number(old.plays)||0)+1,lastPlayed:Date.now()};
  let dailyAdvanced=false;
  if(game.cfg?.daily&&today&&p.daily.lastDate!==today){
    p.daily.streak=nextDailyStreak(p.daily.lastDate,p.daily.streak,today);p.daily.lastDate=today;dailyAdvanced=true;
  }
  writeProgress(p);
  return {newBest,best,plays:p.games[game.id].plays,dailyAdvanced,streak:Number(p.daily.streak)||0};
}

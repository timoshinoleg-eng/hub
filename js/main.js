import { bridge } from './bridge.js';
import { track, hasConsent, setConsent, subscribe } from './track.js';
import { cardDataUrl, shareText } from './share.js';
import { duelResult } from './duel.js';
import { dailySeed } from './daily.js';
import { getGameProgress, getSummary, recordFinish } from './progress.js';
import { GAMES, byId, visible } from './games.js';

const CFG=window.HUB_CONFIG||{};
const SHOW_ALL=new URLSearchParams(location.search).has('all');
const HUB_NAME=CFG.hubName||'Игротека';
const $=(s)=>document.querySelector(s);
const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n};
const state={game:null,score:null,challenge:null,finishMeta:null};
window.__hubStartParam=bridge.startParam();

function esc(s){return String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function formatBest(g,best){return best==null?'Рекорда ещё нет':`Рекорд ${best}${g.unit?' '+g.unit:''}`}
function deepLink(gameId,score){const bot=CFG.bot;if(!bot)return '';const p=score==null?`g${gameId}`:`g${gameId}_s${score}`;return `https://max.ru/${bot}?startapp=${p}`}
function parseStartParam(sp){const m=/^g([a-z]+)(?:_s(\d+))?$/i.exec(sp||'');if(!m)return null;const game=byId(m[1].toLowerCase());return game?{game,challenge:m[2]?Number(m[2]):null}:null}
function dailyGameForDate(date){const pool=GAMES.filter((g)=>g.enabled&&g.cfg?.daily);if(!pool.length)return null;const n=[...date].reduce((a,c)=>a+c.charCodeAt(0),0);return pool[n%pool.length]}

function renderMenu(){
  const today=dailySeed();const summary=getSummary(today);const daily=dailyGameForDate(today);
  $('#streak-chip').innerHTML=`<strong>${summary.streak}</strong>🔥 серия`;
  if(daily){
    const pg=getGameProgress(daily.id);
    $('#daily-card').innerHTML=`<div class="daily-card" style="--d1:${daily.accent};--d2:${daily.accent2}"><div class="daily-top"><span class="daily-label">✦ ВЫЗОВ ДНЯ</span><span class="daily-status">${summary.completedToday?'✓ серия сохранена':'новый шанс сегодня'}</span></div><div class="daily-main"><div class="daily-emoji">${daily.emoji}</div><div class="daily-copy"><h2>${esc(daily.title)}</h2><p>${esc(daily.tagline)} · ${esc(formatBest(daily,pg.best))}</p></div></div><button class="daily-play" id="daily-play">${summary.completedToday?'Сыграть ещё раз':'Играть сейчас'}</button></div>`;
    $('#daily-play').onclick=()=>openGame(daily.id);
  }
  const list=$('#games');list.innerHTML='';
  for(const g of visible(SHOW_ALL)){
    const pg=getGameProgress(g.id);const card=el('button','gcard'+(g.enabled?'':' draft'));
    card.dataset.id=g.id;card.style.setProperty('--game',g.accent||'#7568ff');card.style.setProperty('--game2',g.accent2||g.accent||'#4ce3e8');
    card.innerHTML=`<div class="gcard-top"><span class="ge">${g.emoji}</span><span class="gbadge ${g.cfg?.daily?'daily':''}">${g.cfg?.daily?'✦ DAILY':esc(g.genre||g.length)}</span></div><span class="gt"><b>${esc(g.title)}</b><i>${esc(g.tagline)}</i></span><span class="gfoot"><span class="gbest">${esc(pg.best==null?g.length:formatBest(g,pg.best))}</span><span class="garrow">›</span></span>`;
    card.addEventListener('click',()=>openGame(g.id));list.appendChild(card);
  }
  $('#count').textContent=`${visible(SHOW_ALL).length} игр`;
  $('#progress-strip').innerHTML=`<div class="pstat"><strong>${summary.finishes}</strong><span>завершено игр</span></div><div class="pstat"><strong>${summary.records}</strong><span>личных рекордов</span></div><div class="pstat"><strong>${summary.streak}</strong><span>дней подряд</span></div>`;
}

let offBack=()=>{};
let lastScoreHaptic=0;
function tipSeen(id){try{return localStorage.getItem('hub_tip_'+id)==='1'}catch{return true}}
function markTip(id){try{localStorage.setItem('hub_tip_'+id,'1')}catch{}}
function showGameTip(g){if(!g?.howTo||tipSeen(g.id))return;markTip(g.id);const n=el('div','game-tip');n.innerHTML=`${esc(g.howTo)}<small>Подсказка показывается только один раз</small>`;$('#overlay').appendChild(n);setTimeout(()=>n.remove(),4200)}
function openGame(id,challenge=null){
  const g=byId(id);if(!g)return;state.game=g;state.score=null;state.challenge=challenge;state.finishMeta=null;lastScoreHaptic=0;
  const pg=getGameProgress(g.id);$('#game-title').textContent=g.title;$('#game-meta').textContent=`${g.genre} · ${formatBest(g,pg.best)}`;$('#game-score').textContent='';
  let src=`games/${g.id}/index.html`;if(g.cfg?.daily)src+='?seed='+dailySeed();if(challenge!=null)src+=(src.includes('?')?'&':'?')+'challenge='+challenge;
  $('#game-frame').src=src;$('#overlay').innerHTML='';document.body.dataset.view='game';track('open_game',g.id);bridge.haptic('selection');offBack();offBack=bridge.onBack(backToMenu);setTimeout(()=>state.game?.id===g.id&&showGameTip(g),500);
}
function backToMenu(){offBack();offBack=()=>{};$('#game-frame').src='about:blank';$('#game-score').textContent='';document.body.dataset.view='menu';state.game=null;state.challenge=null;renderMenu();track('back_to_menu')}
function onMessage(e){
  const d=e.data;if(!d||d.__hub!==1)return;const f=document.getElementById('game-frame');if(!f||e.source!==f.contentWindow)return;
  if(d.type==='ready'){if(!state.game||d.game!==state.game.id)return;f.contentWindow.postMessage({__hub:1,type:'cfg',game:d.game,cfg:state.game.cfg||{}},'*');return}
  if(!state.game)return;
  if(d.type==='score'){
    const hadScore=state.score!=null;const changed=String(state.score)!==String(d.value);state.score=d.value;$('#game-score').textContent=d.value;
    const now=performance.now();if(hadScore&&changed&&now-lastScoreHaptic>140){bridge.haptic('selection');lastScoreHaptic=now}return;
  }
  if(d.type==='finish'){
    state.score=d.score??state.score;const today=dailySeed();state.finishMeta=recordFinish(state.game,state.score??0,today);
    track('finish',state.game.id,state.score);if(state.finishMeta.newBest)track('new_record',state.game.id,state.score);if(state.finishMeta.dailyAdvanced)track('daily_complete',state.game.id,state.finishMeta.streak);showResult();
  }
}
function confettiHtml(){const colors=['#ff5f7e','#ffc760','#54e6d2','#7568ff','#fff'];return `<div class="confetti">${Array.from({length:22},(_,i)=>`<i style="--x:${(i*37)%100}%;--c:${colors[i%colors.length]};--d:${1.7+(i%5)*.18}s;--delay:${(i%7)*.04}s;--r:${(i*29)%180}deg;--drift:${-34+(i%9)*8}px"></i>`).join('')}</div>`}
function showResult(){
  const g=state.game;if(!g)return;const score=state.score??0;const meta=state.finishMeta||{};const link=deepLink(g.id,score);const duel=duelResult(score,state.challenge,g.cfg?.higherIsBetter!==false);const box=el('div','result');
  const duelLine=duel?`<div class="rduel ${duel.won?'win':'lose'}">${duel.won?'🏆 Челлендж выигран!':'До победы не хватило совсем немного'}</div>`:'';if(duel)track(duel.won?'duel_win':'duel_lose',g.id,score);
  const dailyLine=meta.dailyAdvanced?`<div class="rdaily">🔥 Серия продлена: ${meta.streak} ${meta.streak===1?'день':'дн.'}</div>`:'';
  box.innerHTML=`<div class="rcard" style="--result-glow:${g.accent||'#6d5cff'}">${meta.newBest?confettiHtml():''}${meta.newBest?'<div class="record-pill">✦ НОВЫЙ РЕКОРД</div>':''}<div class="result-emoji">${g.emoji}</div><div class="rttl">${esc(g.title)}</div><div class="result-score">${score}${g.unit?' <span style="font-size:14px;letter-spacing:0">'+esc(g.unit)+'</span>':''}</div><div class="rbest">${meta.newBest?'Лучший результат сохранён':esc(formatBest(g,meta.best))}</div>${duelLine}${dailyLine}<div class="rrow"><button class="btn primary" id="r-again">Ещё раз</button><button class="btn" id="r-share">Поделиться</button></div><div class="rrow"><button class="btn ghost" id="r-menu">К играм</button><button class="btn ghost" id="r-notify">Получать новинки</button></div><img class="rimg" alt="карточка результата"><div class="rhint" id="r-hint"></div></div>`;
  box.querySelector('.rimg').src=cardDataUrl({title:g.title,emoji:g.emoji,score,unit:g.unit,hubName:HUB_NAME});
  box.querySelector('#r-again').onclick=()=>{track('replay',g.id,score);box.remove();openGame(g.id,state.challenge)};
  box.querySelector('#r-menu').onclick=()=>{box.remove();backToMenu()};
  box.querySelector('#r-share').onclick=async()=>{const ok=await bridge.share(shareText({title:g.title,score,unit:g.unit,link}),link);track(ok?'share_ok':'share_fallback',g.id,score);if(!ok){box.querySelector('#r-hint').textContent='Шаринг не открылся — карточка результата показана ниже.';box.querySelector('.rimg').style.display='block'}};
  box.querySelector('#r-notify').onclick=async(ev)=>{const btn=ev.target;if(!hasConsent()){showConsent(()=>doSubscribe(btn,g,score));return}await doSubscribe(btn,g,score)};
  $('#overlay').innerHTML='';$('#overlay').appendChild(box);bridge.haptic(meta.newBest?'notify':'selection');
}
async function doSubscribe(btn,g,score){const r=await subscribe(g.id);track(r.ok?'notify_subscribe':'notify_failed',g.id,score);btn.textContent=r.ok?'✓ Подписка включена':'Не получилось';btn.disabled=r.ok;if(r.ok)bridge.haptic('notify')}
function showConsent(onAccept){const box=el('div','result');box.innerHTML=`<div class="rcard"><div class="rttl" style="font-size:18px;color:#fff;margin-bottom:8px">Получать игровые новинки?</div><p style="margin:0 0 14px;color:var(--mut);font-size:12.5px">Чтобы написать вам в MAX, сервер проверит подписанные данные приложения и сохранит идентификатор пользователя. <a href="${CFG.policyUrl||'#'}" target="_blank" rel="noopener">Политика обработки данных</a></p><div class="rrow"><button class="btn primary" id="c-yes">Согласен</button><button class="btn" id="c-no">Не надо</button></div></div>`;box.querySelector('#c-yes').onclick=()=>{setConsent();track('consent_yes');box.remove();onAccept?.()};box.querySelector('#c-no').onclick=()=>{track('consent_no');box.remove()};$('#overlay').appendChild(box)}
function init(){
  bridge.ready();bridge.expand();renderMenu();window.addEventListener('message',onMessage);$('#back').addEventListener('click',backToMenu);$('#reload').addEventListener('click',()=>state.game&&openGame(state.game.id,state.challenge));track('open_bot');
  const parts=['Мини-игры в MAX · без рекламы и покупок'];if(CFG.orgName)parts.push(CFG.orgName);const links=[];if(CFG.policyUrl)links.push(`<a href="${CFG.policyUrl}" target="_blank" rel="noopener">Политика</a>`);if(CFG.offerUrl)links.push(`<a href="${CFG.offerUrl}" target="_blank" rel="noopener">Оферта</a>`);$('#legal').innerHTML=parts.join(' · ')+(links.length?'<br>'+links.join(' · '):'');
  const sp=parseStartParam(window.__hubStartParam);if(sp){track('deep_link_open',sp.game.id,sp.challenge);openGame(sp.game.id,sp.challenge);if(sp.challenge!=null){const higher=sp.game.cfg?.higherIsBetter!==false;const txt=higher?`Челлендж: набери больше ${sp.challenge}${sp.game.unit?' '+sp.game.unit:''} 🎯`:`Челлендж: уложись в ${sp.challenge}${sp.game.unit?' '+sp.game.unit:''} 🎯`;const n=el('div','challenge',txt);$('#overlay').appendChild(n);setTimeout(()=>n.remove(),4000)}}
  if(!CFG.bot)console.warn('[hub] HUB_CONFIG.bot не задан — deep link в шаринге работать не будет');
}
document.addEventListener('DOMContentLoaded',init);

const holes=[...document.querySelectorAll('.hole')];
const scoreBoard=document.querySelector('.score');
const moles=[...document.querySelectorAll('.mole')];
const button=document.querySelector('#start');
const timeEl=document.querySelector('#time');
const timeBar=document.querySelector('#time-bar');
const comboEl=document.querySelector('#combo');
const DURATION=30000;
let lastHole=null,timeUp=true,score=0,combo=0,run=0,tickId=null;

const randomTime=(min,max)=>Math.round(Math.random()*(max-min)+min);
function randomHole(){let hole;do{hole=holes[Math.floor(Math.random()*holes.length)]}while(hole===lastHole&&holes.length>1);lastHole=hole;return hole}
function updateHud(){scoreBoard.textContent=String(score);comboEl.textContent='×'+combo;window.parent.postMessage({__hub:1,type:'score',value:score},'*')}
function pace(){const level=Math.min(score,35);return {min:Math.max(170,410-level*5),max:Math.max(390,880-level*11)}}
function peep(id){
  if(timeUp||id!==run)return;const p=pace(),time=randomTime(p.min,p.max),hole=randomHole();hole.classList.remove('missed');hole.classList.add('up');
  setTimeout(()=>{if(id!==run)return;const missed=hole.classList.contains('up');hole.classList.remove('up');if(missed){combo=0;comboEl.textContent='×0';hole.classList.add('missed');setTimeout(()=>hole.classList.remove('missed'),210)}if(!timeUp)peep(id)},time);
}
function finishRun(id){if(id!==run||timeUp)return;timeUp=true;clearInterval(tickId);tickId=null;holes.forEach((h)=>h.classList.remove('up'));timeEl.textContent='0';timeBar.style.width='0%';button.textContent='Ещё раунд';button.hidden=false;window.parent.postMessage({__hub:1,type:'finish',score},'*')}
function startGame(){
  run++;const id=run;timeUp=false;score=0;combo=0;lastHole=null;updateHud();button.hidden=true;timeEl.textContent='30';timeBar.style.width='100%';const end=performance.now()+DURATION;
  clearInterval(tickId);tickId=setInterval(()=>{const left=Math.max(0,end-performance.now());timeEl.textContent=String(Math.ceil(left/1000));timeBar.style.width=(left/DURATION*100)+'%';if(left<=0)finishRun(id)},100);peep(id);
}
function bonk(e){
  if(!e.isTrusted||timeUp)return;const hole=this.parentElement;if(!hole.classList.contains('up'))return;score++;combo++;hole.classList.remove('up');hole.classList.remove('hit');void hole.offsetWidth;hole.classList.add('hit');const burst=document.createElement('span');burst.className='burst';burst.textContent=combo>=5?'+'+1+' 🔥':'+1';hole.appendChild(burst);setTimeout(()=>burst.remove(),450);updateHud();
}
button.addEventListener('click',startGame);
moles.forEach((mole)=>{mole.addEventListener('click',bonk);mole.addEventListener('touchstart',(e)=>{e.preventDefault();bonk.call(mole,e)},{passive:false})});

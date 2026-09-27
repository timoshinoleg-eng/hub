const boardEl=document.querySelector('.play-board');
const scoreEl=document.querySelector('.score');
const highEl=document.querySelector('.high-score');
const controls=[...document.querySelectorAll('.controls button')];
const GRID=24;
let body=[{x:7,y:12},{x:6,y:12},{x:5,y:12}],velocity={x:1,y:0},nextVelocity={x:1,y:0},food={x:17,y:12},score=0,ended=false,paused=false;
let highScore=Number(localStorage.getItem('snake-high-score')||0);
const occupied=(x,y)=>body.some((p)=>p.x===x&&p.y===y);
function placeFood(){let x,y;do{x=Math.floor(Math.random()*GRID)+1;y=Math.floor(Math.random()*GRID)+1}while(occupied(x,y));food={x,y}}
function updateHud(){scoreEl.textContent=`Счёт: ${score}`;highEl.textContent=`Рекорд: ${highScore}`;window.parent.postMessage({__hub:1,type:'score',value:score},'*')}
function render(){let html=`<div class="food" style="grid-area:${food.y}/${food.x}"></div>`;body.forEach((p)=>{html+=`<div class="head" style="grid-area:${p.y}/${p.x}"></div>`});boardEl.innerHTML=html}
function finish(){if(ended)return;ended=true;window.parent.postMessage({__hub:1,type:'finish',score},'*')}
function tick(){
  if(ended||paused)return;velocity=nextVelocity;const head={x:body[0].x+velocity.x,y:body[0].y+velocity.y};const ate=head.x===food.x&&head.y===food.y;
  const collisionBody=ate?body:body.slice(0,-1);if(head.x<1||head.x>GRID||head.y<1||head.y>GRID||collisionBody.some((p)=>p.x===head.x&&p.y===head.y)){finish();return}
  body.unshift(head);if(ate){score++;if(score>highScore){highScore=score;localStorage.setItem('snake-high-score',String(highScore))}placeFood();updateHud()}else body.pop();render();
}
function setDirection(key){const map={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};const d=map[key];if(!d)return;if(d.x===-velocity.x&&d.y===-velocity.y)return;nextVelocity=d}
controls.forEach((b)=>b.addEventListener('pointerdown',(e)=>{e.preventDefault();setDirection(b.dataset.key)}));
document.addEventListener('keyup',(e)=>setDirection(e.key));
let sx=0,sy=0;document.addEventListener('touchstart',(e)=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});document.addEventListener('touchend',(e)=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)<22&&Math.abs(dy)<22)return;setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'ArrowRight':'ArrowLeft'):(dy>0?'ArrowDown':'ArrowUp'))},{passive:true});
document.addEventListener('visibilitychange',()=>{paused=document.hidden});
placeFood();updateHud();render();setInterval(tick,100);

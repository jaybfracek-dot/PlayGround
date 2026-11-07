(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, T = 40, COLS = 24, ROWS = 15;
  const SAVE_KEY = 'meadowmere-save-v1';
  const tools = [
    {id:'hoe',name:'Hoe',icon:'⛏',key:'1'},
    {id:'water',name:'Watering can',icon:'🪣',key:'2'},
    {id:'seed',name:'Parsnip seeds',icon:'🌱',key:'3'},
    {id:'scythe',name:'Scythe',icon:'🌾',key:'4'}
  ];
  const products = {parsnip:{name:'Parsnip',icon:'🥕',price:35}, bean:{name:'Green bean',icon:'🫛',price:60}, potato:{name:'Potato',icon:'🥔',price:50}, flower:{name:'Wildflower',icon:'🌼',price:20}};
  const state = {
    day:1,gold:500,energy:100,maxEnergy:100,minutes:360,player:{x:9.5,y:8.2,face:'down'},selected:'hoe',
    inventory:{parsnipSeed:15,parsnip:0,beanSeed:0,potatoSeed:0,flower:0,bean:0,potato:0},
    soil:{},forage:{},goals:{hoe:false,plant:false,water:false},rain:false,sound:false,walking:false
  };
  try { const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(saved&&saved.player){Object.assign(state,saved);state.player.walking=false;} } catch(e){}
  const $=id=>document.getElementById(id);
  let toastTimer, lastTick=performance.now(), moveTick=0, moveKeys={}, mouseTile=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const tileKey=(x,y)=>`${x},${y}`;
  const inside=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS;
  function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch(e){}}
  function say(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100);}
  function inventoryList(){return [['parsnipSeed','🌱','Parsnip seeds'],['parsnip','🥕','Parsnips'],['beanSeed','🫛','Bean seeds'],['bean','🫛','Green beans'],['potatoSeed','🥔','Potato seeds'],['potato','🥔','Potatoes'],['flower','🌼','Wildflowers']];}
  function drawHUD(){
    $('gold').textContent=state.gold;
    $('energyText').textContent=`${state.energy} / ${state.maxEnergy}`;
    $('energyFill').style.width=`${state.energy}%`;
    const h=Math.floor(state.minutes/60),m=state.minutes%60;
    $('timeLabel').textContent=`${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
    $('timeFill').style.width=`${clamp((state.minutes-360)/(1200-360)*100,0,100)}%`;
    $('dateLabel').innerHTML=`Day ${state.day} <span>of Spring</span>`;
    $('weatherIcon').textContent=state.rain?'☂':'☀';$('weatherText').textContent=state.rain?'Light rain':'Sunny';
    $('toolbar').innerHTML=tools.map((t,i)=>`<button class="tool-slot ${state.selected===t.id?'active':''}" data-tool="${t.id}" title="${t.name} (${t.key})"><span class="slot-key">${t.key}</span><span class="tool-emoji">${t.icon}</span>${t.id==='seed'?`<span class="slot-count">${state.inventory.parsnipSeed}</span>`:''}</button>`).join('');
    $('inventory').innerHTML=inventoryList().map(([id,icon,label])=>{let n=state.inventory[id]||0;return `<div class="inv-item ${n===0?'empty':''}" title="${label}"><span class="item-emoji">${icon}</span><span class="item-count">${n}</span></div>`}).join('');
    const goals=[['hoe','⌁','Tend a patch of earth'],['plant','🌱','Plant your first seed'],['water','💧','Give your seedlings a drink']];
    $('goals').innerHTML=goals.map(([id,icon,text])=>`<div class="goal ${state.goals[id]?'done':''}"><span class="check">${state.goals[id]?'✓':''}</span><span class="goal-icon">${icon}</span><span class="goal-text">${text}</span></div>`).join('');
    $('goalCount').textContent=`${Object.values(state.goals).filter(Boolean).length} / 3`;
    $('sleepHint').classList.toggle('visible',Math.hypot(state.player.x-3.5,state.player.y-4.9)<1.9);
  }
  function seededNoise(x,y){let v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v)}
  function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function drawGround(){
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      let n=seededNoise(x,y), shade=n>.72?'#8fbd79':n<.12?'#83b474':'#88b979';
      ctx.fillStyle=shade;ctx.fillRect(x*T,y*T,T,T);
      if(n>.48){ctx.fillStyle=n>.8?'#a2c987':'#79aa6b';ctx.fillRect(x*T+6+n*18,y*T+8,T>0?2:1,2);ctx.fillRect(x*T+26-n*8,y*T+28,2,2)}
    }
    // Worn winding path from the farmhouse door to the shipping post
    for(let y=4;y<12;y++){for(let x=3;x<22;x++){let center=10+(y-7)*2.2;let onPath=(x>=3&&x<=5&&y>=4&&y<=7)||(y===7&&x>=4&&x<=12)||(Math.abs(x-center)<1.25)||(y===8&&x>=12&&x<=20);if(onPath){let px=x*T,py=y*T;ctx.fillStyle=seededNoise(x+5,y+20)>.48?'#c9b986':'#d3c492';ctx.fillRect(px,py,T,T);ctx.fillStyle='#b9a875';ctx.fillRect(px+5,py+10,3,2);ctx.fillRect(px+29,py+29,2,2)}}}
    // little flower tufts, deterministic
    for(let y=1;y<14;y++)for(let x=1;x<23;x++){let n=seededNoise(x*4,y*4);if(n>.974&&!blockedDecor(x,y)){ctx.fillStyle=n>.989?'#fff5d5':'#eecb89';ctx.fillRect(x*T+13,y*T+17,3,3);ctx.fillStyle='#54874d';ctx.fillRect(x*T+15,y*T+20,2,4)}}
  }
  function blockedDecor(x,y){return (x>=1&&x<=5&&y>=1&&y<=5)||(x>=17&&x<=23&&y<=5)||(x>=6&&x<=12&&y>=5&&y<=10)||(x>=18&&x<=21&&y>=7&&y<=11)}
  function drawPond(){
    ctx.fillStyle='#5eabaf';ctx.beginPath();ctx.ellipse(850,107,104,75,-.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#78c1bf';ctx.beginPath();ctx.ellipse(845,99,88,58,-.12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#9bd6c8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(800,86);ctx.quadraticCurveTo(823,78,844,82);ctx.stroke();ctx.beginPath();ctx.moveTo(864,119);ctx.quadraticCurveTo(891,114,906,119);ctx.stroke();
    // reed clumps
    for(const [x,y] of [[756,113],[919,92],[885,158],[774,72]]){ctx.strokeStyle='#527b4d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x-3,y-9);ctx.moveTo(x+2,y+12);ctx.lineTo(x+7,y-14);ctx.stroke();ctx.fillStyle='#718e51';ctx.fillRect(x-7,y-12,7,4);ctx.fillRect(x+4,y-16,8,4)}
  }
  function drawHouse(){
    const x=68,y=63;
    // shadow
    rounded(x-4,y+69,184,21,10,'#38584333');
    // roof
    ctx.fillStyle='#9c6047';ctx.beginPath();ctx.moveTo(x-8,y+34);ctx.lineTo(x+85,y-9);ctx.lineTo(x+180,y+34);ctx.lineTo(x+174,y+47);ctx.lineTo(x,y+47);ctx.closePath();ctx.fill();
    ctx.fillStyle='#b87554';ctx.beginPath();ctx.moveTo(x+5,y+33);ctx.lineTo(x+85,y-2);ctx.lineTo(x+164,y+33);ctx.lineTo(x+164,y+41);ctx.lineTo(x+5,y+41);ctx.closePath();ctx.fill();
    for(let i=0;i<6;i++){ctx.strokeStyle='#8c5541';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+12+i*25,y+30-i*10);ctx.lineTo(x+24+i*22,y+35+i*1);ctx.stroke()}
    ctx.fillStyle='#e7d6a5';ctx.fillRect(x+11,y+39,148,42);ctx.fillStyle='#d5c28c';ctx.fillRect(x+11,y+77,148,5);
    // windows
    for(let wx of [x+29,x+121]){ctx.fillStyle='#7fa9a0';ctx.fillRect(wx,y+49,22,18);ctx.strokeStyle='#f7e7b6';ctx.lineWidth=3;ctx.strokeRect(wx,y+49,22,18);ctx.beginPath();ctx.moveTo(wx+11,y+49);ctx.lineTo(wx+11,y+67);ctx.moveTo(wx,y+58);ctx.lineTo(wx+22,y+58);ctx.stroke()}
    ctx.fillStyle='#795342';ctx.fillRect(x+72,y+52,28,30);ctx.fillStyle='#d4a875';ctx.fillRect(x+76,y+56,20,26);ctx.fillStyle='#a5794e';ctx.beginPath();ctx.arc(x+91,y+67,2,0,7);ctx.fill();
    ctx.fillStyle='#eff0dc';ctx.font='bold 8px sans-serif';ctx.fillText('HOME',x+76,y+95);
    // shrubs
    for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#5c9258':'#6da15f';ctx.beginPath();ctx.arc(x+11+i*37,y+84+(i%2)*4,9,0,7);ctx.fill()}
  }
  function drawTrees(){
    const trees=[[45,178,1],[176,154,.8],[326,67,.76],[588,61,.85],[690,180,.7],[910,261,.92],[932,431,.75],[73,466,.82],[165,504,.72],[586,520,.9],[890,530,.85],[340,522,.75],[14,325,.7],[630,312,.6],[440,76,.56],[224,72,.72]];
    for(const [cx,cy,s] of trees){ctx.fillStyle='#31573c48';ctx.beginPath();ctx.ellipse(cx+4,cy+21*s,21*s,9*s,0,0,7);ctx.fill();ctx.fillStyle='#73533d';ctx.fillRect(cx-4*s,cy-5*s,8*s,26*s);ctx.fillStyle='#47794c';ctx.beginPath();ctx.arc(cx,cy-14*s,23*s,0,7);ctx.arc(cx-13*s,cy-4*s,16*s,0,7);ctx.arc(cx+14*s,cy-3*s,16*s,0,7);ctx.fill();ctx.fillStyle='#609159';ctx.beginPath();ctx.arc(cx-7*s,cy-21*s,13*s,0,7);ctx.fill();ctx.fillStyle='#78a666';ctx.fillRect(cx-12*s,cy-27*s,5*s,3*s)}
  }
  function drawShipping(){
    const x=792,y=323;ctx.fillStyle='#42604355';ctx.beginPath();ctx.ellipse(x+25,y+39,32,8,0,0,7);ctx.fill();ctx.fillStyle='#9d6947';ctx.fillRect(x,y+4,50,31);ctx.fillStyle='#b27e54';ctx.fillRect(x+3,y+1,44,7);ctx.fillStyle='#81583d';ctx.fillRect(x+5,y+17,40,4);ctx.fillStyle='#f2e5bd';ctx.font='bold 7px sans-serif';ctx.fillText('SHIP',x+13,y+15);ctx.fillStyle='#d19d62';ctx.fillRect(x+14,y+35,5,8);ctx.fillRect(x+33,y+35,5,8)
  }
  function drawSoil(){
    for(const [key,d] of Object.entries(state.soil)){const [x,y]=key.split(',').map(Number),px=x*T,py=y*T;
      ctx.fillStyle=d.watered?'#705c42':'#806543';ctx.fillRect(px+2,py+2,36,36);
      ctx.strokeStyle=d.watered?'#94765a':'#a1835e';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(px+5,py+9+i*10);ctx.lineTo(px+35,py+9+i*10);ctx.stroke()}
      if(d.crop){let stage=d.stage||0;let grow=Math.min(1,stage/d.days);let h=7+grow*21;ctx.strokeStyle='#4b7e49';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px+20,py+28);ctx.lineTo(px+20,py+28-h);ctx.stroke();ctx.fillStyle=stage>=d.days?'#559451':'#69a85b';ctx.beginPath();ctx.ellipse(px+14,py+25-h*.56,7,4,-.45,0,7);ctx.ellipse(px+26,py+23-h*.82,7,4,.48,0,7);ctx.fill();if(stage>=d.days){ctx.fillStyle=d.crop==='parsnip'?'#f4cb70':d.crop==='bean'?'#8eae63':'#eec865';ctx.beginPath();ctx.arc(px+20,py+9,7,0,7);ctx.fill();ctx.fillStyle='#fff0c9';ctx.fillRect(px+18,py+4,3,3)}}
      if(d.watered){ctx.fillStyle='#c2dfd266';ctx.fillRect(px+4,py+4,32,32)}
    }
  }
  function drawForage(){for(const [key,v] of Object.entries(state.forage)){if(v.day<=state.day)continue;const [x,y]=key.split(',').map(Number);ctx.font='18px serif';ctx.textAlign='center';ctx.fillText(v.icon,x*T+20,y*T+26)}ctx.textAlign='left'}
  function drawPlayer(now){
    const x=state.player.x*T,y=state.player.y*T,wob=state.player.walking?Math.sin(now/75)*2:0;
    ctx.fillStyle='#31503d44';ctx.beginPath();ctx.ellipse(x,y+12,12,5,0,0,7);ctx.fill();
    ctx.fillStyle='#594c3d';ctx.fillRect(x-7,y+3+wob,5,9);ctx.fillRect(x+2,y+3-wob,5,9);
    ctx.fillStyle='#d5a77c';ctx.fillRect(x-8,y-11,16,16);
    ctx.fillStyle='#4d7252';ctx.fillRect(x-10,y-2,20,11);ctx.fillStyle='#d4a258';ctx.fillRect(x-10,y+6,20,3);
    ctx.fillStyle='#493d32';ctx.fillRect(x-9,y-14,18,6);ctx.fillRect(x-11,y-10,22,3);
    ctx.fillStyle='#493d32';let eyeX=state.player.face==='left'?-4:state.player.face==='right'?4:4;ctx.fillRect(x+eyeX,y-5,2,2);
    ctx.fillStyle='#d5a77c';if(state.player.face==='left')ctx.fillRect(x-12,y-1,4,5);if(state.player.face==='right')ctx.fillRect(x+8,y-1,4,5);
  }
  function draw(now){
    ctx.clearRect(0,0,W,H);drawGround();drawPond();drawHouse();drawTrees();drawShipping();drawForage();drawSoil();
    // hover outline / reach indicator
    if(mouseTile&&inside(mouseTile.x,mouseTile.y)){let d=Math.hypot(mouseTile.x+.5-state.player.x,mouseTile.y+.5-state.player.y);ctx.strokeStyle=d<1.6?'#fff6b8':'#ffffff77';ctx.lineWidth=2;ctx.strokeRect(mouseTile.x*T+2,mouseTile.y*T+2,36,36)}
    drawPlayer(now);
    if(state.minutes>=1230){ctx.fillStyle='#1c344088';ctx.fillRect(0,0,W,H)}
    requestAnimationFrame(draw);
  }
  function walkable(x,y){if(x<.5||x>23.4||y<.5||y>14.4)return false;
    if(x>1.3&&x<5.4&&y>1.1&&y<4.2)return false;
    if(x>18.3&&x<22.7&&y<4.6)return false;
    if(x>17.9&&x<21.8&&y>7.5&&y<9.3)return false;
    // trees are soft blockers
    for(const [cx,cy,s] of [[45,178,1],[176,154,.8],[326,67,.76],[588,61,.85],[690,180,.7],[910,261,.92],[932,431,.75],[73,466,.82],[165,504,.72],[586,520,.9],[890,530,.85],[340,522,.75],[14,325,.7],[630,312,.6],[440,76,.56],[224,72,.72]])if(Math.hypot(x*T-cx,y*T-cy)<17*s)return false;
    return true;
  }
  function spend(amount=3){if(state.energy<amount){say('You’re all tuckered out. Call it a day?');return false}state.energy-=amount;state.minutes=Math.min(1390,state.minutes+20);return true}
  function getTarget(){let x=Math.floor(state.player.x),y=Math.floor(state.player.y);let f=state.player.face;let tx=x+(f==='right'?1:f==='left'?-1:0),ty=y+(f==='down'?1:f==='up'?-1:0);return {x:tx,y:ty}}
  function useTool(x,y){if(x==null||y==null)return;if(!inside(x,y))return;let dist=Math.hypot(x+.5-state.player.x,y+.5-state.player.y);if(dist>1.65){say('That’s a little too far away.');return}
    const key=tileKey(x,y),soil=state.soil[key];
    if(state.selected==='hoe'){
      if(soil){say('This patch is ready for a little seed.');return}if(!spend(3))return;
      state.soil[key]={watered:false,crop:null};state.goals.hoe=true;say('A lovely little patch of earth.');
    } else if(state.selected==='seed'){
      if(!soil){say('Use your hoe to prepare the earth first.');return}if(soil.crop){say('There’s already something growing here.');return}if(state.inventory.parsnipSeed<1){say('No seeds left. Visit the market for more.');return}if(!spend(2))return;
      state.inventory.parsnipSeed--;soil.crop='parsnip';soil.stage=0;soil.days=3;state.goals.plant=true;say('A parsnip seed, tucked in nice and snug.');
    } else if(state.selected==='water'){
      if(!soil||!soil.crop){say('Nothing planted there just yet.');return}if(soil.watered){say('That little sprout is already watered.');return}if(!spend(2))return;soil.watered=true;state.goals.water=true;say('A good drink for your seedling.');
    } else if(state.selected==='scythe'){
      if(soil&&soil.crop&&soil.stage>=soil.days){if(!spend(2))return;let item=soil.crop;state.inventory[item]=(state.inventory[item]||0)+1;soil.crop=null;soil.stage=0;say(`Harvested a ${products[item].name.toLowerCase()}!`)}
      else if(state.forage[key]&&state.forage[key].day>state.day){if(!spend(1))return;let f=state.forage[key];state.inventory[f.item]=(state.inventory[f.item]||0)+1;delete state.forage[key];say('A little something for your basket!')}
      else say('Nothing ready to harvest here yet.');
    }
    drawHUD();save();
  }
  function act(){const t=getTarget();useTool(t.x,t.y)}
  function move(dx,dy){if(!dx&&!dy)return;const p=state.player;p.face=dx<0?'left':dx>0?'right':dy<0?'up':'down';let nx=p.x+dx*.13,ny=p.y+dy*.13;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.walking=true;}
  function sleep(){state.day++;state.minutes=360;state.energy=100;state.goals={hoe:false,plant:false,water:false};state.rain=Math.random()<.22;
    for(const d of Object.values(state.soil)){if(d.crop&&d.watered)d.stage=Math.min(d.days,d.stage+1);d.watered=state.rain;}
    // New wild finds occasionally appear around the edges of the farm
    if(Math.random()<.65){let spots=[[6,3],[13,5],[14,10],[4,12],[16,12],[22,6],[9,12],[6,10]];let [x,y]=spots[Math.floor(Math.random()*spots.length)];let k=tileKey(x,y);if(!state.forage[k])state.forage[k]={day:state.day+1,item:'flower',icon:'🌼'};}
    $('journal').textContent=state.rain?'The rain tapped on the roof all night. The little plants are grateful.':'A new day is waiting just outside the window. Take it at your own pace.';
    drawHUD();say(state.rain?'A rainy new day! Your crops got watered overnight.':'Good morning! The farm is yours again.');save();
  }
  function shipAll(){let total=0,earned=0;for(const [item,info] of Object.entries(products)){let n=state.inventory[item]||0;if(n){total+=n;earned+=n*info.price;state.inventory[item]=0}}if(!total){say('Your shipping basket is empty for now.');return}state.gold+=earned;drawHUD();save();say(`Shipped ${total} item${total===1?'':'s'} for ${earned}g!`)}
  function openShop(){const list=[['parsnipSeed','🌱','Parsnip seeds','A sturdy spring favorite.','20g',20],['beanSeed','🫛','Green bean seeds','Keep producing as they grow.','60g',60],['potatoSeed','🥔','Potato seeds','A satisfying harvest.','50g',50]];$('shopItems').innerHTML=list.map(([id,icon,name,desc,cost,price])=>`<div class="shop-item"><span class="shop-emoji">${icon}</span><div class="shop-desc"><b>${name}</b><span>${desc}</span></div><button class="shop-buy" data-buy="${id}" data-price="${price}">Buy · ${cost}</button></div>`).join('');$('modalBackdrop').hidden=false;document.querySelectorAll('.shop-buy').forEach(b=>b.onclick=()=>{let price=+b.dataset.price,id=b.dataset.buy;if(state.gold<price){say('Not quite enough gold yet.');return}state.gold-=price;state.inventory[id]+=5;drawHUD();save();say('Five fresh seeds added to your bag!');});}
  function pointToTile(e){const rect=canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-rect.left)/rect.width*W/T),y:Math.floor((e.clientY-rect.top)/rect.height*H/T)}}
  canvas.addEventListener('pointermove',e=>{mouseTile=pointToTile(e)});
  canvas.addEventListener('pointerleave',()=>mouseTile=null);
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();const t=pointToTile(e);if(inside(t.x,t.y)){let dx=t.x+.5-state.player.x,dy=t.y+.5-state.player.y;if(Math.hypot(dx,dy)>1.65){let mag=Math.hypot(dx,dy);let nx=state.player.x+dx/mag*.75,ny=state.player.y+dy/mag*.75;if(walkable(nx,ny)){state.player.x=nx;state.player.y=ny}state.player.face=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');}useTool(t.x,t.y)}});
  document.getElementById('toolbar').addEventListener('click',e=>{let b=e.target.closest('[data-tool]');if(!b)return;state.selected=b.dataset.tool;drawHUD();save()});
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.repeat)return;let k=e.key.toLowerCase();if(k==='1'||k==='2'||k==='3'||k==='4'){state.selected=tools[+k-1].id;drawHUD();save()}else if(k===' '||k==='e'){if(k==='e'&&Math.hypot(state.player.x-3.5,state.player.y-4.9)>2){act()}else if(k==='e'){sleep()}else act()}else if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){moveKeys[k]=true;move(k==='a'||k==='arrowleft'?-1:k==='d'||k==='arrowright'?1:0,k==='w'||k==='arrowup'?-1:k==='s'||k==='arrowdown'?1:0)}});
  window.addEventListener('keyup',e=>{delete moveKeys[e.key.toLowerCase()]});
  function loop(now){if(now-moveTick>115){let dx=(moveKeys.a||moveKeys.arrowleft?-1:0)+(moveKeys.d||moveKeys.arrowright?1:0),dy=(moveKeys.w||moveKeys.arrowup?-1:0)+(moveKeys.s||moveKeys.arrowdown?1:0);if(dx||dy){move(dx,dy);moveTick=now;if(now-lastTick>900){state.minutes=Math.min(1390,state.minutes+10);drawHUD();lastTick=now;save()}}else state.player.walking=false}requestAnimationFrame(loop)}
  document.querySelectorAll('[data-move]').forEach(b=>{const dir=b.dataset.move;const map={up:['w',0,-1],down:['s',0,1],left:['a',-1,0],right:['d',1,0]},[k,dx,dy]=map[dir];b.addEventListener('pointerdown',e=>{e.preventDefault();moveKeys[k]=true;move(dx,dy)});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>delete moveKeys[k]))});
  $('sleepBtn').onclick=sleep;$('sellBtn').onclick=shipAll;$('shopBtn').onclick=openShop;
  $('modalClose').onclick=()=>$('modalBackdrop').hidden=true;$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))$('modalBackdrop').hidden=true});
  $('soundBtn').onclick=()=>{state.sound=!state.sound;$('soundBtn').style.background=state.sound?'#e4eedf':'#fff';say(state.sound?'A little birdsong would be lovely.':'Sound off.');};
  drawHUD();requestAnimationFrame(draw);requestAnimationFrame(loop);
})();

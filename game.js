(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const keysDown = new Set();
  const touchDirs = new Set();
  const mapW = 24, mapH = 20;
  let grid, player, enemies, bullets, blasts, pickups, exit, running = false, won = false;
  let lastTime = 0, fireHeld = false, fireClock = 0, toastClock = 0, soundOn = true, audio;
  let width = 0, height = 0, dpr = 1, tileW = 46, tileH = 23;
  const colors = {floor:'#252a22', floorAlt:'#282d24', wall:'#44483b', wallTop:'#555849', acid:'#d5ec55', red:'#e65443'};
  const spawnPoints = [[3,9],[8,3],[10,15],[15,8],[20,10],[4,16],[21,16],[16,3]];

  function resize(){
    const box = canvas.getBoundingClientRect(); width = box.width; height = box.height; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    tileW = width < 700 ? 38 : 46; tileH = tileW * .5;
  }
  addEventListener('resize', resize); resize();

  function makeMap(){
    grid = Array.from({length:mapH},(_,y)=>Array.from({length:mapW},(_,x)=>x===0||y===0||x===mapW-1||y===mapH-1?1:0));
    // Broken bulkheads form a readable, connected maze of combat lanes.
    for(let y=1;y<mapH-1;y++) if(![2,9,16].includes(y)) grid[y][6]=1;
    for(let y=1;y<mapH-1;y++) if(![4,11,17].includes(y)) grid[y][12]=1;
    for(let y=1;y<mapH-1;y++) if(![3,9,15].includes(y)) grid[y][18]=1;
    for(let x=1;x<6;x++) if(x!==3) grid[5][x]=1;
    for(let x=7;x<12;x++) if(x!==9) grid[12][x]=1;
    for(let x=13;x<18;x++) if(x!==15) grid[7][x]=1;
    for(let x=19;x<23;x++) if(x!==21) grid[13][x]=1;
    // A few chunky pillars make the corridors feel less sterile.
    [[3,3],[9,3],[15,3],[4,10],[9,9],[15,15],[21,8],[21,17]].forEach(([x,y])=>grid[y][x]=1);
    // Keep objective points navigable if a maze edit ever overlaps them.
    [[2,2],[10,9],[20,15],[22,2],[2,9],...spawnPoints].forEach(([x,y])=>grid[y][x]=0);
  }
  function reset(){
    makeMap(); player={x:2.4,y:2.7,hp:100,armor:40,angle:0,invuln:0,attack:0};
    enemies=spawnPoints.slice(0,6).map(([x,y],i)=>({x:x+.5,y:y+.5,hp:i%3===0?3:2,speed:.72+(i%3)*.07,attack:0,flash:0,phase:Math.random()*6}));
    bullets=[];blasts=[];pickups=[{x:10.5,y:9.5,taken:false},{x:20.5,y:15.5,taken:false},{x:22.3,y:2.5,taken:false}];
    exit={x:21.5,y:2.1,open:false}; won=false; running=true;
    $('#overlay').classList.add('hidden'); $('#start-button').innerHTML='ENTER THE SECTOR <span>▶</span>';
    $('#health-value').textContent='100';$('#health-bar').style.width='100%';$('#armor-value').textContent='40';$('#key-count').textContent='0 / 3';
    document.querySelectorAll('.key-icon').forEach(e=>e.classList.remove('collected'));
    $('#enemy-count').textContent=String(enemies.length).padStart(2,'0');$('#mission-text').textContent='FIND THE KEYCARDS';
    say('INTRUDER ALERT — SECURE THE ACCESS KEYS',false,2.4); lastTime=performance.now(); requestAnimationFrame(loop);
  }
  function wall(x,y){const gx=Math.floor(x),gy=Math.floor(y);return gx<0||gy<0||gx>=mapW||gy>=mapH||grid[gy][gx]===1;}
  function canStand(x,y,r=.22){return !wall(x-r,y-r)&&!wall(x+r,y-r)&&!wall(x-r,y+r)&&!wall(x+r,y+r);}
  function worldToScreen(x,y,cx,cy){return {x:width/2+(x-y)*tileW/2-cx,y:height/2+(x+y)*tileH/2-cy};}
  function camera(){return worldToScreen(player.x,player.y,0,0);}
  function screenPoint(x,y){const c=camera();return worldToScreen(x,y,c.x-width/2,c.y-height/2);}

  function drawFloor(x,y,p){
    const alt=(x*13+y*7)%11===0;ctx.beginPath();ctx.moveTo(p.x,p.y-tileH/2);ctx.lineTo(p.x+tileW/2,p.y);ctx.lineTo(p.x,p.y+tileH/2);ctx.lineTo(p.x-tileW/2,p.y);ctx.closePath();
    ctx.fillStyle=alt?colors.floorAlt:colors.floor;ctx.fill();ctx.strokeStyle='rgba(8,11,8,.35)';ctx.lineWidth=.7;ctx.stroke();
    if((x*7+y*11)%23===0){ctx.strokeStyle='rgba(193,204,154,.09)';ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+4,p.y);ctx.stroke();}
  }
  function drawWall(x,y,p){
    const hh=tileH*.9;ctx.beginPath();ctx.moveTo(p.x-tileW/2,p.y);ctx.lineTo(p.x,p.y+tileH/2);ctx.lineTo(p.x,p.y+tileH/2-hh);ctx.lineTo(p.x-tileW/2,p.y-hh);ctx.closePath();ctx.fillStyle='#353a31';ctx.fill();
    ctx.beginPath();ctx.moveTo(p.x+tileW/2,p.y);ctx.lineTo(p.x,p.y+tileH/2);ctx.lineTo(p.x,p.y+tileH/2-hh);ctx.lineTo(p.x+tileW/2,p.y-hh);ctx.closePath();ctx.fillStyle='#292e27';ctx.fill();
    ctx.beginPath();ctx.moveTo(p.x,p.y-tileH/2-hh);ctx.lineTo(p.x+tileW/2,p.y-hh);ctx.lineTo(p.x,p.y+tileH/2-hh);ctx.lineTo(p.x-tileW/2,p.y-hh);ctx.closePath();ctx.fillStyle=colors.wallTop;ctx.fill();ctx.strokeStyle='rgba(174,184,147,.15)';ctx.lineWidth=.7;ctx.stroke();
    ctx.strokeStyle='rgba(187,194,163,.16)';ctx.beginPath();ctx.moveTo(p.x-tileW*.27,p.y-hh+tileH*.17);ctx.lineTo(p.x+tileW*.27,p.y-hh+tileH*.17);ctx.stroke();
  }
  function drawWorld(){
    const cam=camera();
    ctx.fillStyle='#151a15';ctx.fillRect(0,0,width,height);
    // Subtle ground haze.
    const haze=ctx.createRadialGradient(width*.54,height*.53,10,width*.54,height*.53,Math.max(width,height)*.72);haze.addColorStop(0,'rgba(61,73,44,.12)');haze.addColorStop(1,'rgba(0,0,0,.37)');ctx.fillStyle=haze;ctx.fillRect(0,0,width,height);
    for(let sum=0;sum<mapW+mapH-1;sum++)for(let y=Math.max(0,sum-mapW+1);y<=Math.min(mapH-1,sum);y++){let x=sum-y;const p=worldToScreen(x,y,cam.x-width/2,cam.y-height/2);if(p.x< -tileW||p.x>width+tileW||p.y< -tileH*2||p.y>height+tileH*2)continue;drawFloor(x,y,p);if(grid[y][x])drawWall(x,y,p);}
    drawExit();pickups.forEach((k,i)=>{if(!k.taken)drawKey(k,i);});
    enemies.forEach(drawEnemy);drawPlayer();bullets.forEach(drawBullet);blasts.forEach(drawBlast);
  }
  function drawExit(){const p=screenPoint(exit.x,exit.y),open=exit.open;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=open?'rgba(181,222,70,.15)':'rgba(190,55,43,.12)';ctx.beginPath();ctx.ellipse(0,0,20,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=open?'#71883a':'#4c2926';ctx.fillRect(-10,-27,20,29);ctx.fillStyle=open?'#b8dd56':'#8c4135';ctx.fillRect(-7,-23,14,22);ctx.fillStyle=open?'#e1f987':'#ed6854';ctx.fillRect(-4,-20,8,2);ctx.fillStyle='#161a14';ctx.fillRect(-3,-8,6,9);if(!open){ctx.fillStyle='#f0c847';ctx.fillRect(7,-14,2,4);}ctx.restore();}
  function drawKey(k,i){const p=screenPoint(k.x,k.y),bob=Math.sin(performance.now()/260+i*2)*3;ctx.save();ctx.translate(p.x,p.y-10+bob);ctx.shadowColor='#d5ec55';ctx.shadowBlur=14;ctx.rotate(Math.PI/4);ctx.fillStyle='#d5ec55';ctx.fillRect(-5,-5,10,10);ctx.shadowBlur=0;ctx.fillStyle='#647234';ctx.fillRect(-2,-2,4,4);ctx.restore();ctx.strokeStyle='rgba(213,236,85,.24)';ctx.beginPath();ctx.ellipse(p.x,p.y,13,6,0,0,Math.PI*2);ctx.stroke();}
  function drawPlayer(){const p=screenPoint(player.x,player.y);const flick=player.invuln>0&&Math.floor(performance.now()/80)%2===0;if(flick)return;ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(0,2,13,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#435540';ctx.beginPath();ctx.ellipse(0,-8,9,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a7b493';ctx.beginPath();ctx.arc(0,-17,6.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#263126';ctx.fillRect(-5,-19,10,3);ctx.fillStyle='#db5745';ctx.fillRect(-3,-18,6,1.5);ctx.rotate(-player.angle);ctx.fillStyle='#91968a';ctx.fillRect(4,-11,13,4);ctx.fillStyle='#d4d7c8';ctx.fillRect(13,-10,5,2);ctx.restore();}
  function drawEnemy(e){const p=screenPoint(e.x,e.y),pulse=Math.sin(performance.now()/150+e.phase);ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(0,2,12,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=e.flash>0?'#f3c878':'#55413b';ctx.beginPath();ctx.ellipse(0,-7,8,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c5549';ctx.beginPath();ctx.arc(0,-15,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff5948';ctx.shadowColor='#f43';ctx.shadowBlur=6;ctx.fillRect(-4,-16,2.5,2);ctx.fillRect(2,-16,2.5,2);ctx.shadowBlur=0;ctx.restore();if(e.hp<3){ctx.fillStyle='#171915';ctx.fillRect(p.x-9,p.y-30,18,2);ctx.fillStyle='#d34d40';ctx.fillRect(p.x-9,p.y-30,18*e.hp/3,2);}}
  function drawBullet(b){const p=screenPoint(b.x,b.y);ctx.save();ctx.shadowColor='#ffad53';ctx.shadowBlur=12;ctx.fillStyle='#fff0a1';ctx.beginPath();ctx.arc(p.x,p.y-8,3,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawBlast(b){const p=screenPoint(b.x,b.y),t=1-b.life/b.max,r=3+t*b.size;ctx.save();ctx.globalAlpha=Math.max(0,b.life/b.max);ctx.strokeStyle=t<.35?'#fff4a8':'#ff663e';ctx.lineWidth=2+(1-t)*2;ctx.beginPath();ctx.arc(p.x,p.y-8,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle=t<.25?'rgba(255,228,128,.45)':'rgba(234,68,43,.22)';ctx.beginPath();ctx.arc(p.x,p.y-8,r*.65,0,Math.PI*2);ctx.fill();ctx.restore();}

  function drawHud(){const found=pickups.filter(k=>k.taken).length;document.querySelectorAll('.key-icon').forEach((el,i)=>el.classList.toggle('collected',i<found));$('#key-count').textContent=`${found} / 3`;$('#enemy-count').textContent=String(enemies.length).padStart(2,'0');$('#health-value').textContent=Math.max(0,Math.ceil(player.hp));$('#health-bar').style.width=`${Math.max(0,player.hp)}%`;$('#armor-value').textContent=Math.ceil(player.armor);}
  function say(text,danger=false,secs=1.5){const el=$('#toast');el.textContent=text;el.classList.toggle('danger',danger);el.classList.add('show');toastClock=secs;}
  function beep(freq=160,duration=.08,type='square',volume=.035){if(!soundOn)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=volume;o.connect(g);g.connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.stop(audio.currentTime+duration);}catch(_){}}
  function makeBlast(x,y,size=23){blasts.push({x,y,size,life:.34,max:.34});beep(74,.18,'sawtooth',.045);}
  function nearestEnemy(){let best=null,d=Infinity;for(const e of enemies){const dd=(e.x-player.x)**2+(e.y-player.y)**2;if(dd<d){best=e;d=dd;}}return best;}
  function shoot(){if(fireClock>0)return;fireClock=.19;let target=nearestEnemy(),dx=Math.cos(player.angle),dy=Math.sin(player.angle);if(target){const d=Math.hypot(target.x-player.x,target.y-player.y);if(d<8){dx=(target.x-player.x)/d;dy=(target.y-player.y)/d;player.angle=Math.atan2(dy,dx);}}
    bullets.push({x:player.x+dx*.38,y:player.y+dy*.38,vx:dx*9.5,vy:dy*9.5,life:1.15});beep(260,.055,'sawtooth',.025);
  }
  function update(dt){fireClock=Math.max(0,fireClock-dt);if(fireHeld)shoot();player.invuln=Math.max(0,player.invuln-dt);player.attack=Math.max(0,player.attack-dt);
    let sx=0,sy=0;if(keysDown.has('a')||keysDown.has('arrowleft')||touchDirs.has('left'))sx--;if(keysDown.has('d')||keysDown.has('arrowright')||touchDirs.has('right'))sx++;if(keysDown.has('w')||keysDown.has('arrowup')||touchDirs.has('up'))sy--;if(keysDown.has('s')||keysDown.has('arrowdown')||touchDirs.has('down'))sy++;
    let dx=sx+sy,dy=sy-sx;
    if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;player.angle=Math.atan2(dy,dx);const speed=3.25*dt;if(canStand(player.x+dx*speed,player.y))player.x+=dx*speed;if(canStand(player.x,player.y+dy*speed))player.y+=dy*speed;}
    bullets=bullets.filter(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||wall(b.x,b.y))return false;for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(Math.hypot(e.x-b.x,e.y-b.y)<.34){e.hp--;e.flash=.1;makeBlast(b.x,b.y,10);if(e.hp<=0){makeBlast(e.x,e.y,32);enemies.splice(i,1);beep(102,.12,'triangle',.04);}return false;}}return true;});
    enemies.forEach(e=>{e.flash=Math.max(0,e.flash-dt);e.attack=Math.max(0,e.attack-dt);e.phase+=dt*4;const vx=player.x-e.x,vy=player.y-e.y,d=Math.hypot(vx,vy);if(d>.72){const mx=vx/d*e.speed*dt,my=vy/d*e.speed*dt;if(canStand(e.x+mx,e.y))e.x+=mx;if(canStand(e.x,e.y+my))e.y+=my;}else if(e.attack<=0&&player.invuln<=0){e.attack=.7;const hit=Math.random()<.58;let damage=hit?10:4;if(player.armor>0){const absorb=Math.min(player.armor,damage*.65);player.armor-=absorb;damage-=absorb;}player.hp-=damage;player.invuln=.18;makeBlast(player.x,player.y,15);say('CONTACT — HOSTILE ENGAGED',true,.8);beep(90,.14,'sawtooth',.05);if(player.hp<=0)endGame(false);}});
    blasts=blasts.filter(b=>(b.life-=dt)>0);
    for(const k of pickups){if(!k.taken&&Math.hypot(k.x-player.x,k.y-player.y)<.62){k.taken=true;const n=pickups.filter(a=>a.taken).length;beep(620,.14,'sine',.055);say(`ACCESS KEY ${n} ACQUIRED`,false,1.5);if(n===3){exit.open=true;$('#mission-text').textContent='EXIT UNLOCKED';say('ALL KEYS FOUND — REACH THE BLAST DOOR',false,2.2);}}}
    if(exit.open&&Math.hypot(exit.x-player.x,exit.y-player.y)<.8)endGame(true);
    if(toastClock>0&&(toastClock-=dt)<=0)$('#toast').classList.remove('show');drawHud();
  }
  function endGame(victory){if(!running)return;running=false;won=victory;fireHeld=false;makeBlast(player.x,player.y,60);$('#overlay').classList.remove('hidden');$('#overlay').querySelector('.title-kicker span:first-child').textContent=victory?'EXTRACTION // SUCCESS':'SIGNAL LOST // KIA';$('#overlay').querySelector('h1').innerHTML=victory?'SECTOR<br><em>CLEARED</em>':'YOU ARE<br><em>DEAD</em>';$('#overlay').querySelector('.intro').innerHTML=victory?'Access keys secured. Blast door breached.<br>Extraction team inbound. <strong>Good work, marine.</strong>':'The lower decks have gone quiet.<br>Your signal is gone. <strong>Try again, marine.</strong>';$('#overlay').querySelector('.briefing').innerHTML=victory?'<span>✓</span><div><b>MISSION COMPLETE</b><small>Sector 09 secured.</small></div>':'<span>!</span><div><b>MISSION FAILED</b><small>Never stop moving.</small></div>';$('#start-button').innerHTML='DEPLOY AGAIN <span>▶</span>';}
  function loop(now){if(!running)return;const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;update(dt);drawWorld();requestAnimationFrame(loop);}
  $('#start-button').addEventListener('click',()=>{if(!running)reset();});
  addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keysDown.add(k);if(k===' '){fireHeld=true;if(!running)reset();}});
  addEventListener('keyup',e=>{const k=e.key.toLowerCase();keysDown.delete(k);if(k===' ')fireHeld=false;});
  canvas.addEventListener('pointerdown',e=>{if(!running)return;fireHeld=true;try{canvas.setPointerCapture?.(e.pointerId);}catch(_){}});canvas.addEventListener('pointerup',()=>fireHeld=false);canvas.addEventListener('pointercancel',()=>fireHeld=false);
  document.querySelectorAll('[data-dir]').forEach(btn=>{const dir=btn.dataset.dir;const on=e=>{e.preventDefault();touchDirs.add(dir);btn.classList.add('active');try{btn.setPointerCapture?.(e.pointerId);}catch(_){}};const off=e=>{e.preventDefault();touchDirs.delete(dir);btn.classList.remove('active');};btn.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,off));});
  const fire=$('#fire-button');fire.addEventListener('pointerdown',e=>{e.preventDefault();if(!running)reset();fireHeld=true;fire.classList.add('active');try{fire.setPointerCapture?.(e.pointerId);}catch(_){}});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>fire.addEventListener(ev,e=>{e.preventDefault();fireHeld=false;fire.classList.remove('active');}));
  $('#sound-button').addEventListener('click',()=>{soundOn=!soundOn;$('#sound-button').innerHTML=soundOn?'♪ <span>SOUND ON</span>':'♪ <span>SOUND OFF</span>';if(soundOn)beep(440,.07,'sine');});
  // Draw an atmospheric idle scene behind the deployment briefing.
  reset();running=false;drawWorld();$('#overlay').classList.remove('hidden');
})();

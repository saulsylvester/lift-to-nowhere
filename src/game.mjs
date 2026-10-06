import { floors, floorById } from './floors.mjs';
import { parseFloor, readProgress, saveProgress, collect, canStand, MAX_FLOOR } from './core.mjs';
import { render } from './render.mjs';
import { Sound } from './audio.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#game');
const context = canvas.getContext('2d');
let storage;
try { storage = localStorage; } catch { storage = null; }
const progress = readProgress(storage);
const sound = new Sound(progress.muted);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const keys = new Set();
const model = {
  state: 'lobby', floor: 0, room: null, started: false,
  andy: { x: 240, y: 209, facing: 'up' }, moving: false,
  doorOpen: false, doorOpenedAt: 0, effect: null, travelStart: 0, destination: null,
  transition: 0, celebration: 0, reducedMotion: motionQuery.matches,
  collected: progress.collected,
};
let time = performance.now()/1000, previous = time, toastUntil = 0, lastHint = '', lastObjective = '', saveAvailable = true;
const panel = $('#panel-dialog'), journal = $('#journal-dialog'), gameOver = $('#gameover-dialog');
const isOverlay = () => panel.open || journal.open || gameOver.open || !model.started;
const distance = (x,y) => Math.hypot(model.andy.x-x,model.andy.y-y);
const pad = n => String(n).padStart(2,'0');

function persist(){ saveAvailable = saveProgress(storage,progress); }
function updateCount(){ $('#discovery-count').textContent=`${pad(progress.collected.size)} / 100`;if(journal.open)renderJournal(); }
function notify(message, label='', duration=4){
  const toast=$('#toast');toast.replaceChildren();
  if(label){const strong=document.createElement('strong');strong.textContent=label;toast.append(strong);}
  toast.append(document.createTextNode(message));toast.hidden=false;toastUntil=time+duration;
}
function updateSound(){
  sound.muted=progress.muted;
  const b=$('#sound-button');b.innerHTML=`${progress.muted?'♩':'♫'} <span>SOUND ${progress.muted?'OFF':'ON'}</span>`;
  b.setAttribute('aria-label',progress.muted?'Unmute sound':'Mute sound');
  b.setAttribute('title',`${progress.muted?'Unmute':'Mute'} sound (M)`);
  b.setAttribute('aria-pressed',String(progress.muted));
}
function toggleMute(){ sound.unlock();progress.muted=!progress.muted;updateSound();persist(); }
function setBanner(tag,title,subtitle='',compact=false){
  $('#floor-tag').textContent=tag;$('#room-title').textContent=title;$('#room-subtitle').textContent=subtitle;
  $('#room-banner').classList.toggle('in-room',compact);
}
function enter(state,x,y){
  model.state=state;model.andy.x=x;model.andy.y=y;model.transition=model.reducedMotion?0:.24;
  model.moving=false;model.effect=null;keys.clear();
  $('#floor-readout').innerHTML=`FLOOR <b>${model.floor?pad(model.floor):'G'}</b>`;
  if(state==='lobby'){
    setBanner('GROUND FLOOR','A little out of the ordinary.','The elevator is expecting you.');
    $('#location-label').textContent='THE LOBBY';model.andy.facing='down';
  } else if(state==='elevator'){
    setBanner('NOWHERE TRANSIT','Going somewhere?','Approach the brass panel on the right.');
    $('#location-label').textContent='THE ELEVATOR';model.andy.facing='up';
  } else if(state==='landing'){
    setBanner(`FLOOR ${pad(model.floor)}`,model.room.name,'A perfectly ordinary door. Probably.');
    $('#location-label').textContent=`FLOOR ${pad(model.floor)} · THE LANDING`;model.andy.facing='up';
  } else if(state==='room'){
    progress.visited.add(model.floor);persist();
    setBanner(`FLOOR ${pad(model.floor)}`,model.room.name,'',true);
    $('#location-label').textContent=`FLOOR ${pad(model.floor)} · ${progress.collected.has(model.floor)?'REDISCOVERING':'SOMETHING STRANGE'}`;
    model.andy.facing='up';
  }
}
function start(){
  if(model.started)return;
  sound.unlock();sound.play('button');model.started=true;$('#welcome').hidden=true;canvas.focus();
}
function closeOverlays(){
  if(panel.open)panel.close();if(journal.open)journal.close();keys.clear();canvas.focus();
}
function openPanel(){
  keys.clear();model.moving=false;$('#floor-error').textContent='';$('#floor-input').value='';panel.showModal();$('#floor-input').focus();sound.play('button');
}
function openJournal(){
  if(!model.started||model.state==='travel'||model.state==='gameover'||model.effect?.deadly)return;
  if(journal.open){closeOverlays();return;}
  if(panel.open)return;
  keys.clear();model.moving=false;
  renderJournal();journal.showModal();sound.play('button');
}
function renderJournal(){
  $('#journal-summary').textContent=`${progress.collected.size} discoveries collected · ${progress.visited.size} floors explored · 100 stamps. One extra appetite.`;
  $('.journal-footnote').textContent=saveAvailable?'Your discoveries are saved on this device.':'Saving is unavailable in this browser. Your discoveries will last for this visit.';
  const entries=floors.map(f=>{
    const found=progress.collected.has(f.id),visited=progress.visited.has(f.id);
    const node=document.createElement('div');node.className=`journal-entry ${found?'found':visited?'visited':''}`;
    const num=document.createElement('span');num.className='number';num.textContent=pad(f.id);
    const symbol=document.createElement('span');symbol.className='symbol';symbol.textContent=found?'✧':visited?'○':'·';
    const name=document.createElement('strong');name.textContent=visited?f.name:'Unexplored';
    node.append(num,symbol,name);
    if(found || (visited && f.deadly)){const stamp=document.createElement('small');stamp.textContent=f.deadly?'NO STAMP · DO NOT FEED':f.stamp;node.append(stamp);}
    return node;
  });
  $('#journal-grid').replaceChildren(...entries);
}
function depart(value){
  const floor=parseFloor(value);
  if(floor===null){$('#floor-error').textContent=`A whole number from 1 to ${MAX_FLOOR}, please.`;$('#floor-input').setAttribute('aria-invalid','true');$('#floor-input').focus();return false;}
  if(model.state!=='elevator')return false;
  $('#floor-input').removeAttribute('aria-invalid');closeOverlays();
  model.destination=floor;model.travelStart=time;model.state='travel';model.moving=false;keys.clear();
  model.andy.x=240;model.andy.y=200;model.andy.facing='down';
  setBanner('IN TRANSIT','Between here and elsewhere.','Please hold on to your reality.');
  $('#location-label').textContent=`ON OUR WAY · ${pad(floor)}`;sound.play('door');sound.play('travel');return true;
}
function interaction(){
  if(isOverlay()||model.state==='travel')return null;
  if(model.state==='lobby'&&distance(240,137)<33)return {label:'Enter the elevator',type:'enter'};
  if(model.state==='elevator'&&distance(303,137)<36)return {label:'Choose a floor',type:'panel'};
  if(model.state==='landing'&&distance(240,139)<36&&!model.doorOpen)return {label:'Open the peculiar door',type:'door'};
  if(model.state==='room'&&!model.effect&&distance(model.room.focus.x,model.room.focus.y)<43)return {label:model.room.action,type:'discover'};
  return null;
}
function interact(){
  const action=interaction();if(!action)return;
  sound.unlock();
  if(action.type==='enter'){sound.play('door');enter('elevator',240,204);}
  if(action.type==='panel')openPanel();
  if(action.type==='door'){model.doorOpen=true;model.doorOpenedAt=time;sound.play('door');notify('Go on. Andy has come this far.','DOOR OPEN',2);}
  if(action.type==='discover'){
    if(model.room.deadly){startDevouring();return;}
    model.effect={start:time,rewarded:false};model.moving=false;keys.clear();
    sound.play('effect',model.floor);notify(model.room.caption,'A PECULIAR DISCOVERY',3);
  }
}
function startDevouring(){
  if(model.effect || model.state!=='room')return;
  closeOverlays();keys.clear();model.moving=false;
  model.effect={start:time,deadly:true,origin:{...model.andy},chomped:false};
  sound.play('plant');notify('“FEED ME, ANDY.”','THAT IS NOT A HOUSEPLANT',2.5);
}
function restart(){
  if(model.state!=='gameover')return;
  gameOver.close();model.floor=0;model.room=null;model.destination=null;model.doorOpen=false;
  model.celebration=0;toastUntil=0;$('#toast').hidden=true;
  enter('lobby',240,209);model.andy.facing='up';canvas.focus();sound.play('arrival');
}
function obstacles(){
  const bottomWalls = model.state==='elevator'
    ? [{x:181,y:257,w:70,h:20},{x:299,y:257,w:70,h:20}]
    : [{x:147,y:258,w:146,h:20},{x:333,y:258,w:146,h:20}];
  if(model.state==='lobby')return [{x:128,y:165,w:52,h:18},{x:351,y:182,w:40,h:17},{x:160,y:211,w:23,h:12},{x:90,y:131,w:15,h:12},{x:389,y:132,w:15,h:12},{x:91,y:226,w:15,h:12},{x:388,y:225,w:15,h:12}];
  if(model.state==='elevator')return [...bottomWalls,{x:304,y:130,w:23,h:32}];
  if(model.state==='landing')return [
    ...bottomWalls,...(!model.doorOpen?[{x:240,y:129,w:53,h:45}]:[]),
    {x:138,y:148,w:15,h:13},{x:342,y:153,w:18,h:9},
  ];
  if(model.state==='room')return [...bottomWalls,...model.room.props.filter(p=>!['rug','puddle','letter','sock','shoe','map','rope','bone','ticket','scarf','paint','baton'].includes(p.kind)).map(p=>({x:p.x,y:p.y,w:['table','bench','sofa','tank','bridge','carousel'].includes(p.kind)?38:20,h:12}))];
  return [];
}
function bounds(){
  if(model.state==='elevator')return {left:157,right:323,top:108,bottom:250};
  return {left:80,right:400,top:107,bottom:model.state==='lobby'?234:250};
}
function update(dt){
  model.transition=Math.max(0,model.transition-dt);model.moving=false;
  if(toastUntil&&time>toastUntil){$('#toast').hidden=true;toastUntil=0;}
  if(model.state==='gameover')return;
  if(model.state==='travel'){
    if(time-model.travelStart>=2.15){
      model.floor=model.destination;model.room=floorById.get(model.floor);model.doorOpen=false;enter('elevator',240,212);
      setBanner(`ARRIVED · FLOOR ${pad(model.floor)}`,model.room.name,'Walk down through the elevator doors.');
      sound.play('arrival');
    }
    return;
  }
  if(model.effect){
    const age=time-model.effect.start;
    if(model.effect.deadly){
      if(age>=1.6&&!model.effect.chomped){model.effect.chomped=true;sound.play('chomp');}
      if(age>=3){
        model.state='gameover';keys.clear();model.moving=false;toastUntil=0;$('#toast').hidden=true;
        $('#location-label').textContent='FLOOR 101 · OUT TO LUNCH';
        gameOver.showModal();$('#restart-button').focus();sound.play('gameover');
      }
      return;
    }
    if(age>=2.3&&!model.effect.rewarded){
      model.effect.rewarded=true;
      const fresh=collect(progress,model.floor);
      if(fresh){
        persist();updateCount();sound.play('discovery');
        notify(model.room.stamp,`STAMP ${pad(progress.collected.size)} / 100`,3);
        $('#location-label').textContent=`FLOOR ${pad(model.floor)} · DISCOVERED`;
        if(progress.collected.size===100){model.celebration=time+8;sound.play('complete');notify('One hundred discoveries. One very curious Andy. The building is proud of you.','YOU FOUND EVERY LITTLE ELSEWHERE',8);}
      }
    }
    if(age>=2.7)model.effect=null;
  }
  if(isOverlay()||model.effect)return;
  if(model.state==='room'&&model.room.deadly&&distance(model.room.focus.x,model.room.focus.y)<43){startDevouring();return;}
  let dx=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);
  let dy=(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);
  if(dx||dy){
    const norm=Math.hypot(dx,dy),speed=75*dt;dx=dx/norm*speed;dy=dy/norm*speed;
    model.andy.facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
    const b=bounds(),o=obstacles();const a=model.andy;const oldX=a.x,oldY=a.y;
    if(canStand(a.x+dx,a.y,b,o))a.x+=dx;
    if(canStand(a.x,a.y+dy,b,o))a.y+=dy;
    model.moving=a.x!==oldX||a.y!==oldY;if(model.moving)sound.play('step');
    if(model.state==='lobby'&&a.x>219&&a.x<261&&a.y<126){sound.play('door');enter('elevator',240,204);}
    else if(model.state==='elevator'&&a.x>216&&a.x<264&&a.y>243){
      sound.play('door');if(model.floor)enter('landing',240,214);else enter('lobby',240,149);
    } else if(model.state==='landing'){
      if(a.x>222&&a.x<258&&a.y<111&&model.doorOpen&&time-model.doorOpenedAt>.35){enter('room',240,225);$('#toast').hidden=true;toastUntil=0;}
      else if(a.x>221&&a.x<259&&a.y>244)enter('elevator',240,222);
    } else if(model.state==='room'&&a.x>221&&a.x<259&&a.y>244){enter('landing',240,148);model.andy.facing='down';}
  }
}
function updateHUD(){
  const action=interaction();const hint=action?.label||'';
  if(hint!==lastHint){lastHint=hint;$('#interaction-hint').hidden=!hint;$('#interaction-hint span').textContent=hint;}
  if(toastUntil>time)$('#interaction-hint').hidden=true;
  else $('#interaction-hint').hidden=!hint;
  let objective='';
  if(!model.started)objective='YOUR ADVENTURE STARTS HERE';
  else if(model.state==='lobby')objective='WALK UP THE RUNNER TO THE ELEVATOR';
  else if(model.state==='travel')objective='NEXT STOP: SOMEWHERE A LITTLE STRANGE';
  else if(model.state==='elevator')objective=model.floor?'WALK DOWN TO EXPLORE · E AT THE PANEL TO TRAVEL':'WALK TO THE BRASS PANEL ON THE RIGHT';
  else if(model.state==='landing')objective=model.doorOpen?'WALK THROUGH THE OPEN DOOR · LIFT BEHIND YOU':'APPROACH THE DOOR AND PRESS E';
  else if(model.state==='gameover')objective='GAME OVER · THE PLANT GIVES ITS COMPLIMENTS TO THE CHEF';
  else if(model.state==='room')objective=model.room.deadly?(model.effect?'ANDY IS ON THE MENU':'DO NOT FEED THE PLANT · ESPECIALLY NOT YOURSELF'):model.effect?'A MOMENT OF PERFECT NONSENSE':progress.collected.has(model.floor)?'STAMP COLLECTED · RETURN THROUGH THE BOTTOM DOOR':'FIND THE SPARKLE · GET CLOSE AND PRESS E';
  if(objective!==lastObjective){lastObjective=objective;$('#objective').textContent=objective;}
}
function frame(now){
  time=now/1000;const dt=Math.min(.035,Math.max(0,time-previous));previous=time;
  update(dt);render(context,model,model.reducedMotion?Math.floor(time*8)/8:time);updateHUD();requestAnimationFrame(frame);
}

$('#start-button').addEventListener('click',start);
$('#restart-button').addEventListener('click',restart);
gameOver.addEventListener('cancel',event=>event.preventDefault());
$('#sound-button').addEventListener('click',toggleMute);
$('#journal-button').addEventListener('click',openJournal);
$('#floor-form').addEventListener('submit',event=>{event.preventDefault();depart($('#floor-input').value);});
$('#floor-input').addEventListener('input',()=>{$('#floor-error').textContent='';$('#floor-input').removeAttribute('aria-invalid');});
document.querySelectorAll('[data-floor]').forEach(b=>b.addEventListener('click',()=>{$('#floor-input').value=b.dataset.floor;$('#floor-input').focus();$('#floor-error').textContent='';}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeOverlays));
for(const d of [panel,journal]){
  d.addEventListener('cancel',event=>{event.preventDefault();closeOverlays();});
  d.addEventListener('close',()=>{canvas.focus();});
  d.addEventListener('click',event=>{if(event.target===d){const r=d.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeOverlays();}});
}
canvas.addEventListener('pointerdown',()=>{sound.unlock();canvas.focus();});
window.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if(model.state==='gameover'){
    if(key==='m'&&!event.repeat){event.preventDefault();toggleMute();}
    if(key==='escape'||['w','a','s','d','e','j','arrowup','arrowdown','arrowleft','arrowright'].includes(key))event.preventDefault();
    return;
  }
  if(event.target instanceof HTMLInputElement){if(key==='escape'){event.preventDefault();closeOverlays();}return;}
  if(key==='escape'){closeOverlays();return;}
  if(key==='m'&&!event.repeat){event.preventDefault();toggleMute();return;}
  if(!model.started){if(key==='enter'&&!event.repeat){event.preventDefault();start();}return;}
  if(key==='j'&&!event.repeat){event.preventDefault();openJournal();return;}
  if(isOverlay())return;
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e'].includes(key))event.preventDefault();
  if(key==='e'&&!event.repeat){interact();return;}
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key))keys.add(key);
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{keys.clear();previous=performance.now()/1000;});
motionQuery.addEventListener('change',event=>model.reducedMotion=event.matches);

// Available only with ?dev=1. No dev tools or teleport shortcuts in normal play.
if(new URLSearchParams(location.search).get('dev')==='1'){
  const toolbar=document.createElement('div');toolbar.className='dev-controls';
  toolbar.innerHTML='ROOM INSPECTOR <input aria-label="Inspect floor" id="dev-floor" value="1" inputmode="numeric"><button id="dev-go">Go</button><button id="dev-play">Interact</button><button id="dev-next">Next →</button>';
  document.body.append(toolbar);
  function visit(n){const id=parseFloor(n);if(id===null)return false;gameOver.close();closeOverlays();start();model.floor=id;model.room=floorById.get(id);model.doorOpen=true;enter('room',240,id===101?225:196);$('#dev-floor').value=String(id);return true;}
  $('#dev-go').addEventListener('click',()=>visit($('#dev-floor').value));
  $('#dev-next').addEventListener('click',()=>visit((model.floor%MAX_FLOOR)+1));
  const trigger=()=>{if(model.state!=='room'||model.effect)return;model.andy.x=model.room.focus.x;model.andy.y=model.room.focus.y+24;interact();};
  $('#dev-play').addEventListener('click',trigger);
  window.__andy={
    visit,trigger,
    snapshot:()=>({state:model.state,floor:model.floor,andy:{...model.andy},collected:[...progress.collected],visited:[...progress.visited],effect:!!model.effect,doorOpen:model.doorOpen,muted:progress.muted}),
    setPosition(x,y){if(Number.isFinite(x)&&Number.isFinite(y)){model.andy.x=x;model.andy.y=y;}},
    renderFloor(id,active=false){
      const room=floorById.get(id);if(!room)throw new Error('Unknown floor');
      const c=document.createElement('canvas');c.width=480;c.height=270;
      render(c.getContext('2d'),{...model,state:'room',floor:id,room,andy:{x:240,y:225,facing:'up'},moving:false,effect:active?{start:time-1.2}:null,transition:0},time);
      return c.toDataURL();
    },
    unlockForCompletionTest(){for(let i=1;i<=99;i++){progress.collected.add(i);progress.visited.add(i);}updateCount();},
  };
}
updateCount();updateSound();requestAnimationFrame(frame);

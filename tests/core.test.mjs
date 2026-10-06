import test from 'node:test';
import assert from 'node:assert/strict';
import { floors, floorById } from '../src/floors.mjs';
import { propKinds, effectKinds, palettes } from '../src/render.mjs';
import { parseFloor, readProgress, saveProgress, collect, canStand, SAVE_KEY } from '../src/core.mjs';

test('all 101 floors are individually authored and renderable',()=>{
  assert.equal(floors.length,101);assert.equal(floorById.size,101);
  assert.equal(new Set(floors.map(f=>f.name)).size,101);
  assert.equal(new Set(floors.map(f=>f.caption)).size,101);
  assert.equal(new Set(floors.map(f=>f.stamp)).size,101);
  for(let id=1;id<=101;id++){
    const f=floorById.get(id);assert.ok(f,`Floor ${id}`);
    for(const field of ['name','action','caption','stamp'])assert.ok(f[field].length>3,`${id}: ${field}`);
    assert.ok(palettes[f.palette]);assert.ok(effectKinds.has(f.effect),`${id}: effect ${f.effect}`);
    assert.ok(f.props.length>=4);
    for(const p of f.props){assert.ok(propKinds.has(p.kind),`${id}: prop ${p.kind}`);assert.ok(p.x>90&&p.x<390&&p.y>100&&p.y<225);}
    assert.ok(canStand(240,225,{left:80,right:400,top:107,bottom:250},f.props.map(p=>({x:p.x,y:p.y,w:38,h:12}))),`${id}: clear entry`);
  }
});
test('required anchor rooms exist',()=>{
  const anchors={1:'Coat Check for Shadows',7:'Weather Nursery',13:'The Moon’s Lunch Break',27:'Reverse Aquarium',42:'Traffic Cone Orchestra',64:'Yesterday’s Laundrette',88:'Disco for Absent Guests',100:'Building Inspection'};
  for(const [id,name] of Object.entries(anchors))assert.equal(floorById.get(+id).name,name);
});
test('floor input accepts only whole numbers in range',()=>{
  for(const [input,expected] of [['1',1],['100',100],['101',101],['07',7],[' 42 ',42],['001',1]])assert.equal(parseFloor(input),expected);
  for(const input of ['', ' ', '0', '102', '-1', '1.0','4.2', '1e2','+3','0x10','NaN','Infinity','1 2','123456789'])assert.equal(parseFloor(input),null,input);
});
const memory=()=>{const entries=new Map();return {getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)};};
test('discoveries are deduplicated and survive save/reload',()=>{
  const storage=memory();const p=readProgress(storage);
  assert.equal(collect(p,7),true);assert.equal(collect(p,7),false);assert.equal(collect(p,100),true);assert.equal(collect(p,101),false);
  p.muted=true;assert.equal(saveProgress(storage,p),true);
  const restored=readProgress(storage);assert.deepEqual([...restored.collected],[7,100]);assert.deepEqual([...restored.visited],[7,100]);assert.equal(restored.muted,true);
});
test('invalid and unavailable storage does not prevent play',()=>{
  const storage=memory();storage.setItem(SAVE_KEY,'broken');assert.equal(readProgress(storage).collected.size,0);
  storage.setItem(SAVE_KEY,JSON.stringify({collected:[1,1,0,101,'4',7],visited:null,muted:'yes'}));
  const p=readProgress(storage);assert.deepEqual([...p.collected],[1,7]);assert.deepEqual([...p.visited],[1,7]);assert.equal(p.muted,false);
  assert.equal(saveProgress(null,p),false);assert.equal(readProgress(null).collected.size,0);
});
test('the deadly bonus floor saves its visit but never adds a stamp',()=>{
  const storage=memory();const p=readProgress(storage);p.visited.add(101);
  assert.equal(floorById.get(101).deadly,true);
  assert.equal(collect(p,101),false);saveProgress(storage,p);
  assert.deepEqual([...readProgress(storage).visited],[101]);
  assert.equal(readProgress(storage).collected.size,0);
});
test('collisions prevent crossing walls and furniture, but leave space to approach',()=>{
  const bounds={left:80,right:400,top:107,bottom:250};const table={x:240,y:145,w:38,h:12};
  assert.equal(canStand(79,180,bounds),false);assert.equal(canStand(240,140,bounds,[table]),false);
  assert.equal(canStand(240,161,bounds,[table]),true);assert.equal(canStand(200,141,bounds,[table]),true);
});

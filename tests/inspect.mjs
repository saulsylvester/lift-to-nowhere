// Render all 100 rooms into review sheets, plus the playable UI at several sizes.
// Run with the local server running: node tests/inspect.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const directory='/tmp/andy-visual-qa';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:4173/?dev=1');
await page.getByRole('button',{name:'LET’S GO SOMEWHERE'}).click();
await page.screenshot({path:`${directory}/lobby.png`,fullPage:true});
for(const id of [7,13,27,42,64,88,100]){
  await page.evaluate(id=>{window.__andy.visit(id);window.__andy.trigger();},id);
  await page.waitForTimeout(1000);
  await page.screenshot({path:`${directory}/floor-${id}.png`,fullPage:true});
}
for(let sheet=0;sheet<4;sheet++){
  await page.evaluate(async sheet=>{
    document.getElementById('review-sheet')?.remove();
    const c=document.createElement('canvas');c.id='review-sheet';c.width=1600;c.height=1000;
    c.style.cssText='position:absolute;left:0;top:0;width:1600px;height:1000px;z-index:999;background:#211b2b';
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    const {floors}=await import('/src/floors.mjs');
    for(let i=0;i<25;i++){
      const id=sheet*25+i+1,img=new Image();img.src=window.__andy.renderFloor(id,true);await img.decode();
      const x=i%5*320,y=Math.floor(i/5)*200;ctx.drawImage(img,x,y,320,180);
      ctx.font='10px monospace';ctx.fillStyle='#f1d2a0';ctx.fillText(`${String(id).padStart(3,'0')} · ${floors[id-1].name}`,x+8,y+190);
    }
    document.body.append(c);
  },sheet);
  await page.locator('#review-sheet').screenshot({path:`${directory}/rooms-${sheet*25+1}-${sheet*25+25}.png`});
}
await page.goto('http://127.0.0.1:4173/');
await page.setViewportSize({width:900,height:800});
await page.screenshot({path:`${directory}/compact.png`,fullPage:true});
await browser.close();
console.log(`Visual review images: ${directory}`);

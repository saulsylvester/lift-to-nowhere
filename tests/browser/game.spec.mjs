import { test, expect } from '@playwright/test';

async function walk(page,key,ms){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
async function snapshot(page){return page.evaluate(()=>window.__andy.snapshot());}
async function started(page){await page.goto('/?dev=1');await page.getByRole('button',{name:'LET’S GO SOMEWHERE'}).click();}

test('Andy can complete the full first discovery and return to the elevator using the keyboard',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await started(page);
  await walk(page,'ArrowUp',1350);
  expect((await snapshot(page)).state).toBe('elevator');
  await walk(page,'ArrowRight',820);await walk(page,'ArrowUp',850);
  await expect(page.locator('#interaction-hint')).toContainText('Choose a floor');
  await page.keyboard.press('e');await expect(page.locator('#panel-dialog')).toBeVisible();
  const position=(await snapshot(page)).andy;
  for(const invalid of ['0','102','-1','4.5','1e2','']){
    await page.locator('#floor-input').fill(invalid);await page.keyboard.press('Enter');
    await expect(page.locator('#floor-error')).toContainText('whole number');
    expect((await snapshot(page)).state).toBe('elevator');
  }
  await page.locator('#floor-input').fill('wasd');await page.keyboard.press('ArrowUp');
  expect((await snapshot(page)).andy).toEqual(position);
  await page.locator('#floor-input').fill('1');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  expect((await snapshot(page)).state).toBe('travel');
  await expect.poll(async()=>(await snapshot(page)).state).toBe('elevator');
  expect((await snapshot(page)).floor).toBe(1);
  await walk(page,'ArrowDown',600);expect((await snapshot(page)).state).toBe('landing');
  await walk(page,'ArrowUp',850);await page.keyboard.press('e');expect((await snapshot(page)).doorOpen).toBe(true);
  await walk(page,'ArrowUp',800);expect((await snapshot(page)).state).toBe('room');
  await walk(page,'ArrowUp',650);await expect(page.locator('#interaction-hint')).toContainText('Ring the little bell');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await snapshot(page)).collected).toContain(1);
  await page.waitForTimeout(500);
  await walk(page,'ArrowDown',1300);expect((await snapshot(page)).state).toBe('landing');
  await walk(page,'ArrowDown',1600);expect((await snapshot(page)).state).toBe('elevator');
  await page.keyboard.press('j');await expect(page.locator('#journal-dialog')).toBeVisible();
  await expect(page.locator('.journal-entry.found')).toHaveCount(1);
  await expect(page.locator('.journal-entry.found')).toContainText('OFF DUTY');
  await page.keyboard.press('Escape');await expect(page.locator('#journal-dialog')).not.toBeVisible();
  await walk(page,'ArrowRight',820);await walk(page,'ArrowUp',1100);await page.keyboard.press('e');
  await page.locator('#floor-input').fill('100');await page.keyboard.press('Enter');
  await expect.poll(async()=>(await snapshot(page)).state).toBe('elevator');
  expect((await snapshot(page)).floor).toBe(100);
  expect(errors).toEqual([]);
});

test('every authored room and its animated payoff renders without errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await started(page);
  const result=await page.evaluate(()=>{
    const hashes=new Set();
    for(let id=1;id<=101;id++){
      const idle=window.__andy.renderFloor(id,false),active=window.__andy.renderFloor(id,true);
      if(idle===active)throw new Error(`Floor ${id} has no visual payoff`);
      if(!idle.startsWith('data:image/png;base64,'))throw new Error(`Floor ${id} did not render`);
      hashes.add(idle);
    }
    return hashes.size;
  });
  expect(result).toBe(101);expect(errors).toEqual([]);
});

test('discoveries deduplicate, persist, and replay',async({page})=>{
  await started(page);await page.evaluate(()=>{window.__andy.visit(7);window.__andy.trigger();});
  await expect.poll(async()=>(await snapshot(page)).collected).toEqual([7]);await page.waitForTimeout(500);
  await page.evaluate(()=>window.__andy.trigger());await page.waitForTimeout(2800);
  expect((await snapshot(page)).collected).toEqual([7]);
  await page.keyboard.press('m');expect((await snapshot(page)).muted).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.__andy);
  const restored=await snapshot(page);expect(restored.state).toBe('lobby');expect(restored.collected).toEqual([7]);expect(restored.muted).toBe(true);
  await expect(page.locator('#discovery-count')).toHaveText('01 / 100');
});

test('blur clears movement and journal pauses walking',async({page})=>{
  await started(page);await page.keyboard.down('ArrowLeft');await page.waitForTimeout(200);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const before=(await snapshot(page)).andy;await page.waitForTimeout(250);expect((await snapshot(page)).andy).toEqual(before);
  await page.keyboard.up('ArrowLeft');await page.keyboard.press('j');await walk(page,'ArrowDown',300);
  expect((await snapshot(page)).andy).toEqual(before);await page.keyboard.press('Escape');
  await walk(page,'ArrowRight',300);expect((await snapshot(page)).andy.x).toBeGreaterThan(before.x);
});

test('journal refreshes when a discovery finishes while it is open',async({page})=>{
  await started(page);await page.evaluate(()=>{window.__andy.visit(42);window.__andy.trigger();});
  await page.keyboard.press('j');await expect(page.locator('#journal-dialog')).toBeVisible();
  await expect(page.locator('.journal-entry.found')).toHaveCount(1,{timeout:5000});
  await expect(page.locator('.journal-entry.found')).toContainText('CONE-CERTO');
});

test('storage failure still permits discovery and reduced-motion play',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage denied');};Storage.prototype.setItem=()=>{throw new Error('Storage denied');};});
  await started(page);await page.evaluate(()=>{window.__andy.visit(100);window.__andy.trigger();});
  await expect.poll(async()=>(await snapshot(page)).collected).toEqual([100]);
  await page.keyboard.press('j');await expect(page.locator('.journal-footnote')).toContainText('Saving is unavailable');
});

test('hundredth stamp celebrates and normal mode does not expose inspector',async({page})=>{
  await started(page);await page.evaluate(()=>{window.__andy.unlockForCompletionTest();window.__andy.visit(100);window.__andy.trigger();});
  await expect(page.locator('#toast')).toContainText('YOU FOUND EVERY LITTLE ELSEWHERE',{timeout:5000});
  expect((await snapshot(page)).collected).toHaveLength(100);
  await page.goto('/');expect(await page.evaluate(()=>typeof window.__andy)).toBe('undefined');
  await expect(page.locator('.dev-controls')).toHaveCount(0);
});

test('floor 101 eats Andy, locks game over, and restarts with discoveries intact',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await started(page);
  await page.evaluate(()=>{window.__andy.visit(7);window.__andy.trigger();});
  await expect.poll(async()=>(await snapshot(page)).collected).toEqual([7]);
  await page.evaluate(()=>window.__andy.visit(101));
  expect((await snapshot(page)).effect).toBe(false);
  // Approaching is enough: no interaction key is needed to get eaten.
  await walk(page,'ArrowUp',400);
  expect((await snapshot(page)).effect).toBe(true);
  await page.keyboard.press('j');await expect(page.locator('#journal-dialog')).not.toBeVisible();
  await expect(page.locator('#gameover-dialog')).toBeVisible({timeout:5000});
  expect((await snapshot(page)).state).toBe('gameover');
  expect((await snapshot(page)).collected).toEqual([7]);
  const position=(await snapshot(page)).andy;
  await page.keyboard.press('Escape');await walk(page,'ArrowDown',300);await page.keyboard.press('e');await page.keyboard.press('j');
  await expect(page.locator('#gameover-dialog')).toBeVisible();
  expect((await snapshot(page)).andy).toEqual(position);
  await page.getByRole('button',{name:'ANOTHER ANDY, PLEASE'}).click();
  expect((await snapshot(page)).state).toBe('lobby');
  expect((await snapshot(page)).floor).toBe(0);
  expect((await snapshot(page)).effect).toBe(false);
  expect((await snapshot(page)).collected).toEqual([7]);
  await walk(page,'ArrowLeft',200);expect((await snapshot(page)).andy.x).toBeLessThan(240);
  await page.reload();await page.waitForFunction(()=>window.__andy);
  expect((await snapshot(page)).visited).toContain(101);
  expect((await snapshot(page)).collected).toEqual([7]);
  expect(errors).toEqual([]);
});

test('101 is reachable through the lift and works with reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await started(page);
  await walk(page,'ArrowUp',1350);await walk(page,'ArrowRight',820);await walk(page,'ArrowUp',850);
  await page.keyboard.press('e');await page.locator('#floor-input').fill('101');await page.keyboard.press('Enter');
  await expect.poll(async()=>(await snapshot(page)).state).toBe('elevator');
  expect((await snapshot(page)).floor).toBe(101);
  await walk(page,'ArrowDown',600);await walk(page,'ArrowUp',850);await page.keyboard.press('e');await walk(page,'ArrowUp',800);
  expect((await snapshot(page)).state).toBe('room');
  await walk(page,'ArrowUp',400);
  await expect(page.locator('#gameover-dialog')).toBeVisible({timeout:5000});
  await page.keyboard.press('Enter');expect((await snapshot(page)).state).toBe('lobby');
});

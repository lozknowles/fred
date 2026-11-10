// Explicit actual-world acceptance runner. Does not start a server or deploy.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const origin=process.env.SNOOKER_ORIGIN;if(!origin)throw Error('Set SNOOKER_ORIGIN to the private candidate app.');
const out=resolve(process.env.SNOOKER_EVIDENCE??'../../fred-period/snooker');await mkdir(out,{recursive:true});
const evidence={origin,at:new Date().toISOString(),errors:[]};let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__repositoryWorldApp?.host.active?.snooker&&!window.__repositoryWorldApp.portals.pending,null,{timeout:120000});
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();const hide=page.getByRole('button',{name:'Hide controls',exact:true});if(await hide.isVisible())await hide.click();
 await page.evaluate(()=>{const a=window.__repositoryWorldApp,p=a.host.active.player;p.position.set(-8,3,-83.4);p.velocity.set(0,0,0);p.yaw=0;p.pitch=-.22;a.followCamera?.setEnabled(false);});
 await page.waitForFunction(()=>window.__repositoryWorldApp.host.active.snooker.npcReady,null,{timeout:60000});
 evidence.rig=await page.evaluate(()=>{const t=window.__repositoryWorldApp.host.active.snooker;let skinned=0,bones=0;t.npc.traverse(n=>{if(n.isSkinnedMesh)skinned++;if(n.isBone)bones++;});return {skinned,bones,npc:t.npc.position.toArray(),diagnostics:t.diagnostics()};});assert.ok(evidence.rig.skinned>0);assert.ok(evidence.rig.bones>20);
 await page.screenshot({path:resolve(out,'demonstrator-address.png')});
 await page.waitForFunction(()=>window.__repositoryWorldApp.host.active.snooker.phase==='offer',null,{timeout:60000});
 evidence.demonstration=await page.evaluate(()=>{const t=window.__repositoryWorldApp.host.active.snooker;return {...t.diagnostics(),strokes:t.strokeEvidence,npc:t.npc.position.toArray(),pocketed:t.drill.balls.filter(b=>b.pocket!==null).map(b=>b.id)};});
 assert.equal(evidence.demonstration.shot,2);assert.ok(evidence.demonstration.potted>=2);assert.equal(evidence.demonstration.caption,'This is all too easy. Fancy a go?');assert.notDeepEqual(evidence.demonstration.npc,evidence.rig.npc);
 assert.equal(evidence.demonstration.strokes.length,2);for(const stroke of evidence.demonstration.strokes){assert.equal(stroke.rigReady,true);assert.ok(Math.abs(stroke.distance-.02625)<1e-6,'actual leading tip face touches ball radius');assert.ok(Math.abs(stroke.surfaceGap)<1e-6,'geometry surface gap is zero');assert.ok(stroke.hands.every(p=>p?.every(Number.isFinite)),'actual animated hand bones recorded');}
 assert.ok(await page.getByRole('status').filter({hasText:'This is all too easy. Fancy a go?'}).count());await page.screenshot({path:resolve(out,'demonstrator-invitation.png')});
 await page.locator('canvas').first().focus();await page.keyboard.press('e');await page.waitForFunction(()=>window.__repositoryWorldApp.host.active.snooker.active);
 evidence.turnStart=await page.evaluate(()=>{const a=window.__repositoryWorldApp,t=a.host.active.snooker;return {red:t.drill.balls.find(b=>b.id==='red'),camera:a.camera.position.toArray(),position:a.host.active.player.position.toArray(),inputEnabled:a.input.enabled};});assert.equal(evidence.turnStart.red.pocket,null);assert.deepEqual(evidence.turnStart.camera,[-6.7,5.9,-82.6]);
 await page.getByRole('slider',{name:'Aim',exact:true}).evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.getByRole('slider',{name:'Power',exact:true}).evaluate(el=>{el.value='30';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.getByRole('button',{name:'Shoot',exact:true}).click();
 await page.waitForFunction(()=>window.__repositoryWorldApp.host.active.snooker.drill.balls.some(b=>b.vx!==0||b.vz!==0));
 evidence.playerStroke=await page.evaluate(()=>{const t=window.__repositoryWorldApp.host.active.snooker;return {aim:t.aim,power:t.power,balls:t.drill.balls.map(b=>({...b}))};});assert.equal(evidence.playerStroke.aim,0);assert.equal(evidence.playerStroke.power,.3);assert.ok(evidence.playerStroke.balls.find(b=>b.id==='cue').vx>0);
 await page.screenshot({path:resolve(out,'player-practice.png')});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__repositoryWorldApp.host.active.snooker.active&&window.__repositoryWorldApp.input.enabled);
 evidence.exit=await page.evaluate(()=>{const a=window.__repositoryWorldApp;return {active:a.host.active.snooker.active,camera:a.camera.position.toArray(),position:a.host.active.player.position.toArray(),inputEnabled:a.input.enabled};});assert.deepEqual(evidence.exit.position,evidence.turnStart.position);assert.notDeepEqual(evidence.exit.camera,evidence.turnStart.camera);assert.equal(evidence.errors.length,0);
 evidence.passed=true;
}catch(error){evidence.failure=error.stack;throw error;}finally{await browser?.close();await writeFile(resolve(out,'acceptance.json'),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence,null,2));

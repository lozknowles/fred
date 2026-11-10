import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const origin=process.env.THUMBS_UP_ORIGIN;if(!origin)throw Error('Set THUMBS_UP_ORIGIN to the private candidate; this test does not publish or start a server.');
const output=resolve(process.env.THUMBS_UP_EVIDENCE??'../../fred-period/thumbs-up');await mkdir(output,{recursive:true});
const evidence={origin,at:new Date().toISOString(),errors:[]};let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>evidence.errors.push(error.message));
 await page.goto(origin+'/?renderer=webgl2&view=follow&quality=capture',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__repositoryWorldApp?.avatar?.model&&window.__repositoryWorldApp.host.active&&!window.__repositoryWorldApp.portals.pending,null,{timeout:120000});
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
 if(process.env.THUMBS_UP_FACE_PHOTO){await page.getByRole('button',{name:'Avatar · K',exact:true}).click();await page.locator('#elsemesh-face-file').setInputFiles(process.env.THUMBS_UP_FACE_PHOTO);await page.waitForFunction(()=>!window.__repositoryWorldApp.avatarChooser.faceBusy);await page.getByRole('button',{name:'Save avatar',exact:true}).click();}
 await page.evaluate(async()=>{const app=window.__repositoryWorldApp;await app.avatar.lodReady;document.querySelector('canvas')?.focus();});await page.waitForTimeout(400);
 evidence.before=await page.evaluate(()=>{const app=window.__repositoryWorldApp;return {world:app.host.active.identity.worldId,player:app.player.position.toArray(),mode:app.player.mode,grounded:app.player.grounded,view:app.followCamera.enabled,asset:app.avatar.asset,rig:app.avatar.thumbsUpPose.diagnostics(),lod:app.avatar.model.userData.avatarGeometryLOD?.diagnostics?.()??null};});
 await page.keyboard.press('g');await page.waitForFunction(()=>window.__repositoryWorldApp.avatar.thumbsUpPose.weight===1,null,{timeout:5000});await page.waitForTimeout(400);
 evidence.pose=await page.evaluate(()=>{const app=window.__repositoryWorldApp,pose=app.avatar.thumbsUpPose;const position=bone=>bone.getWorldPosition(app.avatar.group.position.clone().set(0,0,0)).toArray();return {gesture:pose.diagnostics(),camera:app.camera.position.toArray(),avatarYaw:app.avatar.group.rotation.y,shoulder:position(pose.arm),wrist:position(pose.hand),thumb:position(pose.get('Finger02')),player:app.player.position.toArray()};});
 assert.equal(evidence.pose.gesture.active,true);assert.deepEqual(evidence.pose.player,evidence.before.player);await page.screenshot({path:resolve(output,'actual-avatar-thumbs-up.png')});
 await page.waitForFunction(()=>!window.__repositoryWorldApp.avatar.thumbsUpPose.active,null,{timeout:10000});evidence.after=await page.evaluate(()=>{const app=window.__repositoryWorldApp;return {gesture:app.avatar.thumbsUpPose.diagnostics(),player:app.player.position.toArray(),camera:app.camera.position.toArray()};});assert.equal(evidence.after.gesture.active,false);assert.deepEqual(evidence.after.player,evidence.before.player);await page.screenshot({path:resolve(output,'actual-avatar-restored.png')});
}finally{await browser?.close();await writeFile(resolve(output,'acceptance.json'),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence,null,2));

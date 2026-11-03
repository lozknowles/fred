import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Object3D} from 'three';
import {FrameDiagnostics,collectNeonDiagnostics} from '../src/world-runtime/FrameDiagnostics.js';

test('lazy snapshots build once, retain identity and discard unread frame work',()=>{
 const app={},errors=[];
 const frames=new FrameDiagnostics(app,error=>errors.push(error));
 let calls=0;
 assert.equal(app.diagnostics,undefined);
 frames.publish(()=>{calls++;return {frame:1};});
 frames.publish(()=>{calls++;return {frame:2};});
 assert.equal(calls,0);
 const held=app.diagnostics;
 assert.equal(calls,1);
 assert.equal(app.diagnostics,held);
 frames.publish(()=>({frame:3}));
 assert.notEqual(app.diagnostics,held);
 assert.equal(held.frame,2);
 assert.deepEqual(errors,[]);
});

test('captured frame inputs survive activation and teardown after a flush',()=>{
 const app={},frames=new FrameDiagnostics(app,error=>{throw error;});
 let active={world:'old'},weather={flash:1};
 {
  const world=active,frameWeather=weather;
  frames.publish(()=>({world:world.world,weather:frameWeather}));
 }
 frames.read();
 active={world:'new'};
 weather={flash:0};
 assert.deepEqual(app.diagnostics,{world:'old',weather:{flash:1}});
 const held=app.diagnostics;
 active=null;
 assert.equal(app.diagnostics,held);
});

test('a failed lazy sample calls the runtime failure handler once and retains last good value',()=>{
 const app={},errors=[],frames=new FrameDiagnostics(app,error=>errors.push(error));
 frames.publish(()=>({frame:1}));
 const held=app.diagnostics,error=Error('diagnostic failure');
 frames.publish(()=>{throw error;});
 assert.equal(app.diagnostics,held);
 assert.equal(app.diagnostics,held);
 assert.deepEqual(errors,[error]);
});

test('neons reflect post-render replacements, mutations and scene membership in traversal order',()=>{
 const app={},frames=new FrameDiagnostics(app,error=>{throw error;});
 const root=new Group(),replaced=new Object3D(),mutated=new Object3D(),removed=new Object3D();
 replaced.userData.neonState={text:'before eye render'};
 mutated.userData.neonState={brightness:0};
 removed.userData.neonState={text:'removed by nested render'};
 root.add(replaced,mutated,removed);
 const active={root};
 // Model changes after host.update, made by eye/nested scene rendering.
 const afterRender={text:'after eye render'};
 replaced.userData.neonState=afterRender;
 mutated.userData.neonState.brightness=1;
 root.remove(removed);
 const added=new Object3D();
 added.userData.neonState={text:'added by nested render'};
 root.add(added);
 frames.publish(()=>({neons:collectNeonDiagnostics(active)}));
 const held=app.diagnostics;
 assert.deepEqual(held.neons,[afterRender,{brightness:1},added.userData.neonState]);
 assert.equal(held.neons[0],afterRender);
 assert.equal(held.neons[1],mutated.userData.neonState);
 root.remove(added);
 replaced.userData.neonState={text:'next frame'};
 assert.equal(app.diagnostics,held);
 assert.equal(held.neons.length,3);
 assert.equal(held.neons[0],afterRender);
 frames.publish(()=>({neons:collectNeonDiagnostics(active)}));
 assert.deepEqual(app.diagnostics.neons,[{text:'next frame'},{brightness:1}]);
 assert.deepEqual(collectNeonDiagnostics(null),[]);
});

test('runtime captures transients, preserves eye sampling, and flushes before resource invalidation',()=>{
 const source=readFileSync(new URL('../src/world-runtime/main.js',import.meta.url),'utf8');
 assert.match(source,/host.beforeActivate=async\(\)=>\{frameDiagnostics.read\(\);/);
 assert.match(source,/window.addEventListener\('pagehide',\(\)=>\{frameDiagnostics.read\(\);/);
 assert.match(source,/const eyeDiagnostics=playerEyes\?\.diagnostics\(\)\?\?null,diagnosticFrame=engine.frame;/);
 assert.match(source,/weather:weatherState,environment:env,water:water\?\?null/);
 assert.match(source,/frames:diagnosticFrame/);
 assert.match(source,/neons:collectNeonDiagnostics\(active\)/);
 assert.doesNotMatch(source,/collectNeons|frameNeons|updatedActive/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Player} from '../src/player/Player.js';
import {Colliders} from '../src/world/Colliders.js';
import {Vector3,PerspectiveCamera} from '../src/engine/index.js';
import {walkingBlockMessage} from '../src/player/WalkingBlockReason.js';
import {loadWorldSource,describeRuntimeWorld} from '../src/world-runtime/vendor/world-engine-contract.js';
function fixture(colliders){let axes={x:0,y:1,sprint:0};const player=new Player({walkingDiagnostics:true,camera:new PerspectiveCamera(),input:{moveAxes:()=>axes,hit:()=>false,down:()=>false},terrain:{heightAt:()=>0},colliders,query:{allocate:()=>0}});player.position.set(0,0,0);player.yaw=Math.PI;player.grounded=true;player.waterH=player.waterMean=-1000;return {player,axes,run(n=60){for(let i=0;i<n;i++)player.updateWalk(1/60);}};}
test('pinned actual Warehouse RSJ stops normal Player walking with public structural name',async()=>{const root=new URL('../../opening-world/',import.meta.url);const source={kind:'local',label:'private pinned Warehouse',read:async(p,n)=>{const b=await readFile(new URL(p,root));assert(b.length<=n);return b;}};const {project}=await loadWorldSource(source);const descriptor=describeRuntimeWorld(project),id='warehouse:collision:mezzanine-rsj-west',post=descriptor.boxes.find(b=>b.id===id);assert(post,'qualified structural collider must be present');const c=new Colliders();for(const b of descriptor.boxes)c.addBox(new Vector3(...b.center),new Vector3(...b.half),0,{walkable:b.walkable,solid:b.solid,tag:b.id});const f=fixture(c);f.player.terrain=descriptor.terrain;f.player.position.set(post.center[0],3,post.center[2]-post.half[2]-.6);f.player.surfaceType=()=> 'wood';f.run(120);assert.equal(f.player.walkingBlock?.collider.tag,id);assert.equal(walkingBlockMessage(f.player.walkingBlock,project),'Path blocked by Steel mezzanine post');assert(f.player.position.z<=post.center[2]-post.half[2]-.29999);});

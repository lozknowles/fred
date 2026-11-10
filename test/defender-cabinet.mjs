import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {Vector3} from '../src/engine/index.js';
import {Colliders} from '../src/world/Colliders.js';
import {installDefenderCabinet,defenderCabinetEligible,DEFENDER_POSITION} from '../src/world-runtime/DefenderCabinet.js';
import {WAREHOUSE_SURFACE_WORLD,WAREHOUSE_RECIPE_SOURCE} from '../src/world-runtime/WarehouseSurfaces.js';
const createCanvas=()=>({getContext:()=>new Proxy({},{get:(_,key)=>['fillStyle','strokeStyle','lineWidth','textAlign','font'].includes(key)?undefined:()=>{}})});
function candidate(){return {root:new T.Group(),colliders:new Colliders(),descriptor:{worldId:WAREHOUSE_SURFACE_WORLD,project:{assets:[{source:WAREHOUSE_RECIPE_SOURCE}],objects:[{id:'warehouse:object:0000',name:'polished tiled warehouse floor',position:[0,2.85,-77]}]}}};}
test('cabinet scope needs Warehouse identity and original recipe floor/provenance',()=>{
 const c=candidate();assert.equal(defenderCabinetEligible(c),true);c.descriptor.worldId='other';assert.equal(installDefenderCabinet(c),null);c.descriptor.worldId=WAREHOUSE_SURFACE_WORLD;c.descriptor.project.assets[0].source='other';assert.equal(installDefenderCabinet(c),null);assert.equal(c.root.children.length,0);assert.equal(c.colliders.boxes.length,0);
});
test('upright screen has front-facing 4:3 tilted aperture and accessible near region',()=>{
 const c=candidate(),cabinet=installDefenderCabinet(c,{createCanvas});assert.equal(installDefenderCabinet(c),cabinet);assert.deepEqual(cabinet.position,DEFENDER_POSITION);
 const [tl,tr,br,bl]=cabinet.screenWorldCorners();assert.ok(tr[0]>tl[0]);assert.ok(tl[1]>bl[1]);assert.ok(tl[2]<bl[2],'CRT is tilted back');assert.ok(Math.abs(Math.hypot(...tr.map((v,i)=>v-tl[i]))/.54-1)<1e-10);assert.equal(cabinet.near(new Vector3(-11.7,4.62,-89.4)),true);assert.equal(cabinet.near(new Vector3(-11.7,4.62,-91.4)),false);assert.equal(cabinet.near(new Vector3(-11.7,7.1,-89.4)),false);
 assert.ok(cabinet.root.children.some(m=>m.name==='red joystick ball'));for(const name of ['reverse','thrust','fire','smart bomb','hyperspace'])assert.ok(cabinet.root.children.some(m=>m.name===name+' button'));cabinet.dispose();assert.equal(c.root.children.length,0);assert.equal(c.colliders.boxes.length,0);
});
test('cabinet blocks walking from every side while the TV to stair route remains clear',()=>{
 const c=candidate(),cabinet=installDefenderCabinet(c,{createCanvas});assert.equal(c.colliders.boxes[0].walkable,false);
 for(const [x,z]of [[-11.7,-90.1],[-11.7,-91.2],[-12.15,-90.7],[-11.25,-90.7]]){const p=new Vector3(x,3,z),before=p.clone();c.colliders.resolveCapsule(p,.3,1.75,.4);assert.ok(p.distanceTo(before)>.01,'cabinet blocks '+[x,z]);}
 // Main aisle from east-wall TV viewing area to the foot of the original stairs.
 for(let n=0;n<=100;n++){const t=n/100,p=new Vector3(12+(3-12)*t,3,-77+(-79.4+77)*t),before=p.clone();c.colliders.resolveCapsule(p,.3,1.75,.4);assert.equal(p.distanceTo(before),0);}
 cabinet.dispose();
});

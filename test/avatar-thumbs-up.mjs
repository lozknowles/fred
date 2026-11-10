import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {AvatarThumbsUp,canThumbsUp,thumbsUpWeight} from '../src/world-runtime/AvatarThumbsUp.js';
async function rig(asset){
 const data=await readFile(new URL('../public/models/characters/'+asset+'.glb',import.meta.url)),length=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+length)),binary=data.subarray(28+length);
 const nodes=g.nodes.map(n=>{const o=new T.Object3D();o.name=(n.name??'').replaceAll(' ','_');if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;});
 g.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
 const model=new T.Group(),group=new T.Group();group.add(model);g.scenes[g.scene??0].nodes.forEach(i=>model.add(nodes[i]));
 // The real installed idle animation, first key, as the mixer presents it.
 const idle=g.animations.find(a=>a.name==='idle');for(const channel of idle.channels){const accessor=g.accessors[idle.samplers[channel.sampler].output],view=g.bufferViews[accessor.bufferView],count=accessor.type==='VEC4'?4:3,offset=(view.byteOffset??0)+(accessor.byteOffset??0);const values=Array.from({length:count},(_,i)=>binary.readFloatLE(offset+i*4));const node=nodes[channel.target.node];node[channel.target.path==='rotation'?'quaternion':channel.target.path==='translation'?'position':'scale'].fromArray(values);}
 group.updateMatrixWorld(true);const pose=new AvatarThumbsUp({engine:T,model,group}),player={position:new T.Vector3(),velocity:new T.Vector3(),mode:'walk',grounded:true};return {pose,group,model,player};
}
const pos=joint=>joint.getWorldPosition(new T.Vector3());
for(const asset of ['stock-player','stock-female'])test(asset+' uses actual skeleton: raised wrist, upright thumb, curled fingers, reversible joints',async()=>{
 const {pose,group,player,model}=await rig(asset);assert.equal(pose.available,true);const camera={position:new T.Vector3(3.2,2.4,4.5)},saved=new Map();model.traverse(n=>saved.set(n,n.quaternion.clone()));
 const before=JSON.stringify(player),a=pos(pose.arm).distanceTo(pos(pose.forearm)),b=pos(pose.forearm).distanceTo(pos(pose.hand));assert.equal(pose.trigger(player),true);assert.equal(pose.trigger(player),false);
 for(let i=0;i<15;i++){pose.restore();group.rotation.y=pose.face(.1,player,camera,0);pose.apply();}
 assert.equal(pose.weight,1);assert.ok(Math.abs(pos(pose.arm).distanceTo(pos(pose.forearm))-a)<1e-5);assert.ok(Math.abs(pos(pose.forearm).distanceTo(pos(pose.hand))-b)<1e-5);
 const shoulder=group.worldToLocal(pos(pose.arm)),wrist=group.worldToLocal(pos(pose.hand)),delta=wrist.sub(shoulder);assert.ok(delta.distanceTo(new T.Vector3(-.18,.13,.28))<1e-4,delta.toArray().join(','));
 const thumb=pos(pose.get('Finger0')),thumbTip=pos(pose.get('Finger02')),up=thumbTip.clone().sub(thumb).normalize();assert.ok(up.y>.99);assert.ok(thumbTip.y>pos(pose.get('Finger12')).y+.035);
 for(let i=1;i<=4;i++){const root=pose.get('Finger'+i),middle=pose.get('Finger'+i+'1'),end=pose.get('Finger'+i+'2');const first=pos(middle).sub(pos(root)).normalize(),second=pos(end).sub(pos(middle)).normalize();assert.ok(first.dot(second)<.1,'finger '+i+' really bends at its middle joint');}
 const facing=Math.atan2(camera.position.x,camera.position.z);assert.ok(Math.abs(group.rotation.y-facing)<1e-10);assert.equal(JSON.stringify(player),before);
 pose.cancel();for(const [joint,quaternion]of saved)assert.deepEqual(joint.quaternion.toArray(),quaternion.toArray(),joint.name+' restored');
});
test('gesture envelope fades in/out, moving/action/world changes cancel without authority mutation',async()=>{
 assert.equal(thumbsUpWeight(0),0);assert.equal(thumbsUpWeight(2),1);assert.equal(thumbsUpWeight(7),0);assert.ok(thumbsUpWeight(.45)>.4&&thumbsUpWeight(.45)<.6);
 const {pose,player}=await rig('stock-player'),camera={position:new T.Vector3(1,2,4)};for(const mode of ['boat','helm','deck'])assert.equal(canThumbsUp({...player,mode}),false);assert.equal(canThumbsUp({...player,grounded:false}),false);
 pose.trigger(player);player.velocity.x=1;assert.equal(pose.face(.1,player,camera,.4),.4);assert.equal(pose.active,false);
 player.velocity.x=0;pose.trigger(player);assert.equal(pose.face(.1,{...player},camera,.2),.2);assert.equal(pose.active,false);
 pose.trigger(player);pose.face(.1,player,camera,0,{enabled:false});assert.equal(pose.active,false);
 pose.trigger(player);for(let i=0;i<70;i++)pose.face(.1,player,camera,0);assert.equal(pose.active,false);
});
test('explicit portrait framing keeps real head and raised thumb in shot and respects collision clearance',async()=>{
 const {pose,player,group}=await rig('stock-player'),camera=new T.PerspectiveCamera(62,16/9,.06,200),active={player};camera.position.set(3.2,3.55,4.5);camera.lookAt(0,1.15,0);pose.trigger(player);
 for(let i=0;i<12;i++){pose.restore();group.rotation.y=pose.face(.1,player,camera,0);pose.apply();}
 const before=camera.position.clone();assert.equal(pose.frameCamera(camera,active,{enabled:true,safeDistance:()=>.5}),false);assert.deepEqual(camera.position.toArray(),before.toArray());
 assert.equal(pose.frameCamera(camera,active,{enabled:true,safeDistance:(_a,_b,_c,wanted)=>wanted}),true);assert.ok(camera.position.distanceTo(new T.Vector3(0,1.47,0))<1.5);
 camera.updateMatrixWorld(true);for(const joint of [pose.bones.get('Bip01 Head'),pose.get('Finger02'),pose.get('Finger12')]){const projected=pos(joint).project(camera);assert.ok(Math.abs(projected.x)<.85&&Math.abs(projected.y)<.85&&projected.z>-1&&projected.z<1,joint.name+' visible in close shot');}
 const thumb=pos(pose.get('Finger02')).project(camera),finger=pos(pose.get('Finger12')).project(camera);assert.ok(thumb.y>finger.y+.04);
 pose.cancel();assert.equal(pose.frameCamera(camera,active,{enabled:true,safeDistance:()=>1}),false);
});

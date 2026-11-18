import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../src/engine/index.js';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {createPortalEffects,PORTAL_STORM_SOURCE} from '../src/world-runtime/RepositoryPortalEffects.js';
const portal={id:'a',position:[3,4,5],yaw:.3,width:2,height:3,visual:{frameColor:'#33ddff'}};
for(const isWebGL of [false,true])test('electric rim retains an open centre and animates on '+(isWebGL?'WebGL':'native'),()=>{
 const E=isWebGL?T:N,root=new E.Group(),effects=createPortalEffects({isWebGL});
 const frame=effects.addFrame(root,portal);assert.deepEqual(frame.position.toArray(),portal.position);assert.equal(frame.rotation.y,portal.yaw);
 const arcs=frame.children.filter(c=>c.name==='Portal electrical storm arc');assert.equal(arcs.length,8);assert.equal(frame.children.length,13);
 for(const arc of arcs){const p=arc.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getX(i))>portal.width/2+.09||Math.abs(p.getY(i))>portal.height/2+.09,'geometry stays on outside rim');}
 const before=arcs[0].geometry.getAttribute('position').array.slice();effects.update(.05,1);assert.notDeepEqual(arcs[0].geometry.getAttribute('position').array,before);
 assert.equal(effects.diagnostics().source,PORTAL_STORM_SOURCE);
 effects.transition('preparing');assert.equal(effects.diagnostics().beamVisible,false);
 effects.transition('handoff-pending');assert.equal(effects.diagnostics().beamVisible,true);
 for(let i=0;i<30;i++){effects.transition('handoff-pending');effects.update(.05,i*.05);}assert.equal(effects.diagnostics().beamVisible,false,'long pending transfers cannot loop departure effect');
 effects.transition('active');assert.equal(effects.diagnostics().beamVisible,true);effects.transition('outcome-unknown');assert.equal(effects.diagnostics().beamVisible,false);
 effects.clear();assert.equal(root.children.length,0);assert.equal(effects.diagnostics().frames,0);effects.dispose();effects.dispose();
});

test('cached electrical arc rotation preserves the original rim at both directions and long phases',()=>{
 const root=new T.Group(),effects=createPortalEffects({isWebGL:true});
 const frame=effects.addFrame(root,portal),arcs=frame.children.filter(c=>c.name==='Portal electrical storm arc');
 const originals=arcs.map((_,i)=>new T.TorusGeometry(1.35,.028,4,48,.68+.15*(i%2)));
 const phases=arcs.map(()=>0);
 try{
  for(let step=0;step<1600;step++){
   const dt=step%3===0?.1:.037;
   effects.update(dt,step*.1);
   for(let i=0;i<arcs.length;i++)phases[i]+=dt*(i%2?-.21:.17);
   if(step%83!==0&&step!==1599)continue;
   for(let i=0;i<arcs.length;i++){
    const p=arcs[i].geometry.getAttribute('position'),original=originals[i].getAttribute('position');
    for(let j=0;j<p.count;j++){
     const x=original.getX(j),y=original.getY(j),angle=Math.atan2(y,x)+i*Math.PI*.25+phases[i],c=Math.cos(angle),s=Math.sin(angle);
     const rim=Math.min((portal.width/2+.13)/Math.max(.00001,Math.abs(c)),(portal.height/2+.13)/Math.max(.00001,Math.abs(s)));
     const radius=rim+Math.hypot(x,y)-1.35;
     assert.ok(Math.abs(p.getX(j)-Math.fround(c*radius))<.000001);
     assert.ok(Math.abs(p.getY(j)-Math.fround(s*radius))<.000001);
     assert.equal(p.getZ(j),original.getZ(j));
    }
   }
  }
 }finally{effects.dispose();for(const g of originals)g.dispose();}
});

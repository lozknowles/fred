import test from 'node:test';
import assert from 'node:assert/strict';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {projectedPortalAperture,portalApertureTargetSize,applyPortalViewCrop,portalMappingMatrix,createWebGLPortalMaterial} from '../src/world-runtime/WebGLPortalViews.js';
const pose=(position=[0,0,0],yaw=0)=>({position,yaw,width:2,height:3});
const camera=()=>{const c=new T.PerspectiveCamera(65,16/9,.1,100);c.position.set(.3,1,3);c.lookAt(0,1,0);c.updateMatrixWorld();return c;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const uv=(p,c)=>{const v=p.clone().project(c);return new T.Vector2((v.x+1)/2,(v.y+1)/2);};
function mapped(c,source,destination){const next=c.clone();next.matrixAutoUpdate=false;next.matrix.multiplyMatrices(portalMappingMatrix(source,destination),c.matrixWorld);next.matrix.decompose(next.position,next.quaternion,next.scale);next.updateMatrixWorld(true);return next;}
test('physical aperture crop increases useful close-door samples at equal 512 cap and shrinks distant allocations',()=>{
 const c=camera(),rect=projectedPortalAperture(c,pose(),1920,1080),size=portalApertureTargetSize(rect,1920,1080);
 assert.equal(Math.max(size.width,size.height),512);
 const oldUsefulWidth=512*rect.z,oldUsefulHeight=288*rect.w;
 assert.ok(size.width/oldUsefulWidth>1.5);assert.ok(size.height/oldUsefulHeight>1.5);
 const distant=portalApertureTargetSize(projectedPortalAperture(c,pose([0,0,-40]),1920,1080),1920,1080);
 assert.ok(distant.width<=64&&distant.height<=64);
 const a=portalApertureTargetSize(new T.Vector4(0,0,.1,.1),1000,1000),b=portalApertureTargetSize(new T.Vector4(0,0,.101,.101),1000,1000);assert.deepEqual(a,b);
});
test('homogeneous crop handles rotated edge/near crossings and rejects wholly rear and pre-near planes',()=>{
 const c=new T.PerspectiveCamera(65,1,.1,100);c.updateMatrixWorld();
 for(const source of [pose([.8,0,-1],.6),{...pose([0,0,-.1],Math.PI/4),width:2,height:2},pose([0,0,-.1])]){
  const rect=projectedPortalAperture(c,source,1200,1200);assert.ok(rect);assert.ok(rect.toArray().every(Number.isFinite));assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.z<=1&&rect.y+rect.w<=1);
 }
 for(const source of [pose([0,0,3]),pose([0,0,-.04]),pose([30,0,-3])])assert.equal(projectedPortalAperture(c,source,1200,1200),null);
});
test('cropped projection and fragment sample are reciprocal for two aligned portals in both directions',()=>{
 for(const reverse of [false,true]){
  const c=camera();if(reverse){c.position.set(-.3,1,-3);c.lookAt(0,1,0);c.updateMatrixWorld();}
  const first=pose([0,0,0],reverse?Math.PI:0),exit=pose([10,0,0],reverse?Math.PI:0),second=pose([10,0,reverse?-3:3],reverse?0:Math.PI),last=pose([20,0,0],reverse?Math.PI:0);
  const outerRect=projectedPortalAperture(c,first,1920,1080),outer=mapped(c,first,exit);applyPortalViewCrop(outer,outerRect);
  const innerRect=projectedPortalAperture(outer,second,384,512),inner=mapped(outer,second,last);applyPortalViewCrop(inner,innerRect);
  assert.ok(innerRect);
  // Compare a third-world point transformed back through both rigid maps with
  // the exact UV that the two fragment shaders successively request.
  const finalPoint=new T.Vector3(20.15,1,reverse?-2:2),secondPoint=finalPoint.clone().applyMatrix4(portalMappingMatrix(second,last).invert()),firstPoint=secondPoint.clone().applyMatrix4(portalMappingMatrix(first,exit).invert());
  const mainUv=uv(firstPoint,c),outerUv=uv(secondPoint,outer),innerUv=uv(finalPoint,inner);
  near((mainUv.x-outerRect.x)/outerRect.z,outerUv.x);near((mainUv.y-outerRect.y)/outerRect.w,outerUv.y);
  near((outerUv.x-innerRect.x)/innerRect.z,innerUv.x);near((outerUv.y-innerRect.y)/innerRect.w,innerUv.y);
  const identity=new T.Matrix4().multiplyMatrices(inner.projectionMatrix,inner.projectionMatrixInverse).elements;identity.forEach((v,i)=>near(v,i%5===0?1:0));
 }
});
test('actual portal shader uses physical viewport origin and crop, with independent uniform storage',()=>{
 const target={texture:{}},a=createWebGLPortalMaterial(target),b=createWebGLPortalMaterial(target);
 assert.match(a.fragmentShader,/gl_FragCoord.xy-framebufferOrigin/);assert.match(a.fragmentShader,/viewRect.xy\)\/viewRect.zw/);
 a.uniforms.viewRect.value.x=.3;assert.equal(b.uniforms.viewRect.value.x,0);a.dispose();b.dispose();
});
test('parallel two-hop bounds and allocations match an independent pinhole oracle at two physical sizes',()=>{
 const c=new T.PerspectiveCamera(60,1.5,.1,100);c.position.z=4;c.updateMatrixWorld();
 const focal=1/Math.tan(Math.PI/6),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
 for(const [width,height]of [[768,512],[1536,1024]]){
  const opening={...pose(),width:3,height:3},outerRect=projectedPortalAperture(c,opening,width,height);
  // Pinhole image width/height, independent of projection/crop implementation.
  const outerW=Math.min(1,focal*3/(2*4*1.5)+4/width),outerH=Math.min(1,focal*3/(2*4)+4/height);
  close(outerRect.z,outerW);close(outerRect.w,outerH);
  const expectedSize=(w,h)=>{const scale=Math.min(1,512/Math.max(w,h));return [w,h].map(v=>Math.min(512,Math.max(32,Math.ceil(v*scale/32)*32)));};
  const expectedOuter=expectedSize(outerW*width,outerH*height),size=portalApertureTargetSize(outerRect,width,height);assert.deepEqual([size.width,size.height],expectedOuter);
  const outer=mapped(c,opening,pose([10,0,0]));applyPortalViewCrop(outer,outerRect);
  const source={...pose([10,0,3],Math.PI),width:1.8,height:1.8},rect=projectedPortalAperture(outer,source,size.width,size.height);
  // Outer virtual eye is z=-4; inner aperture is seven metres away.
  const innerW=focal*1.8/(2*7*1.5)/outerW+4/size.width,innerH=focal*1.8/(2*7)/outerH+4/size.height;
  close(rect.z,innerW);close(rect.w,innerH);close(rect.x,(1-innerW)/2);close(rect.y,(1-innerH)/2);
  const innerSize=portalApertureTargetSize(rect,size.width,size.height);assert.deepEqual([innerSize.width,innerSize.height],expectedSize(innerW*size.width,innerH*size.height));
  assert.ok(innerSize.width>=innerW*size.width&&innerSize.height>=innerH*size.height,'nested allocation covers its physical aperture');
 }
});

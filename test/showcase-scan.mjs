import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {optimizeGlbScans} from '../tools/glb-accessor-scan.mjs';
import {inspectGlbJson as baseline} from '../src/world-runtime/vendor/world-engine-contract.js';
import {GraphicsQualityModel,GRAPHICS_PRESETS} from '../src/world-runtime/GraphicsQuality.js';
const raw=readFileSync(new URL('../src/world-runtime/vendor/world-engine-contract.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const candidate=(await import('data:text/javascript;base64,'+Buffer.from(optimizeGlbScans(raw)).toString('base64'))).inspectGlbJson;
// The view and accessor both have offsets; pad rows (including NaN padding).
// Deliberately allow unaligned bufferView offsets, as the prior contract does.
function sample({type=5123,strided=true,unaligned=false,mutate=()=>{}}={}){
 const b=Buffer.alloc(192),shift=unaligned?1:4,pitch=strided?24:12;
 const width=({5121:1,5123:2,5125:4})[type],ip=strided?8:width,base=shift+4;
 const obj={asset:{version:'2.0'},buffers:[{byteLength:b.length}],bufferViews:[
   {buffer:0,byteOffset:shift,byteLength:4+3*pitch,...(strided?{byteStride:pitch}:{})},
   {buffer:0,byteOffset:100+shift,byteLength:4+3*ip,...(strided?{byteStride:ip}:{})}],
  accessors:[{bufferView:0,byteOffset:4,count:3,type:'VEC3',componentType:5126},{bufferView:1,byteOffset:4,count:3,type:'SCALAR',componentType:type}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],nodes:[{translation:[1,2,3],children:[1]},{mesh:0,scale:[2,3,4]}],scenes:[{nodes:[0]}]};
 const coords=[[0,-1,0],[1,.5,3],[0,2,-2]];for(let i=0;i<3;i++){for(let j=0;j<3;j++)b.writeFloatLE(coords[i][j],base+i*pitch+4*j);if(strided)b.writeFloatLE(NaN,base+i*pitch+12);b.writeUIntLE(i,104+shift+i*ip,width);}
 mutate(obj,b,{base,pitch,ix:104+shift,ip,width});
 const text=JSON.stringify(obj),json=text+' '.repeat((4-text.length%4)%4),bytes=Buffer.alloc(28+json.length+b.length);
 [0x46546c67,2,bytes.length,json.length,0x4e4f534a].forEach((v,i)=>bytes.writeUInt32LE(v,4*i));bytes.write(json,20);bytes.writeUInt32LE(b.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);b.copy(bytes,28+json.length);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
}
const verdict=(fn,b)=>{try{return {result:fn(b)}}catch(e){return {error:e.message}}};
for(const type of [5121,5123,5125])for(const strided of [false,true])for(const unaligned of [false,true])test('geometry parity '+[type,strided,unaligned].join('/'),()=>{
 const base={type,strided,unaligned},x=sample(base);const expectation=verdict(baseline,x);
 assert.deepEqual(expectation.result.bounds,{min:[1,-1,-5],max:[3,8,15]});assert.deepEqual(verdict(candidate,x),expectation);
 for(const [pattern,mutate] of [
  [/nonfinite vertex/,(o,b,k)=>b.writeFloatLE(NaN,k.base+2*k.pitch+8)],
  [/nonfinite vertex/,(o,b,k)=>b.writeFloatLE(-Infinity,k.base+4)],
  [/index exceeds/,(o,b,k)=>b.writeUIntLE(3,k.ix+2*k.ip,k.width)],
  [/triangles are collapsed/,(o,b,k)=>{for(let i=0;i<3;i++)b.writeUIntLE(0,k.ix+i*k.ip,k.width)}],
  [/transformed bounds/,(o)=>{o.nodes[0].translation[0]=100002}],
  [/cycle or shared node/,(o)=>{o.nodes[1].children=[0]}],
  [/buffer view/,(o)=>{o.accessors[0].count=200}]]){
  const b=sample({...base,mutate}),expected=verdict(baseline,b);assert.match(expected.error,pattern);assert.deepEqual(verdict(candidate,b),expected);
 }
});
test('unknown or duplicated scanner input is rejected',()=>{assert.throws(()=>optimizeGlbScans('other'),/Review/);assert.throws(()=>optimizeGlbScans(raw+raw),/Review/)});
function drive(m,ms,step,at=0){for(let end=at+ms;at<end;){at+=typeof step==='function'?step():step;m.observe(at);}return at;}
test('showcase starts at native size, caps high-DPI, and does not penalise a stable 32 Hz renderer',()=>{
 const m=new GraphicsQualityModel(GRAPHICS_PRESETS.showcase);m.setViewport(1366,768,1);assert.equal(m.effective.maxOutputPixels,1366*768);drive(m,24000,31.25);assert.equal(m.snapshot().adaptation.targetFps,30);assert.deepEqual(m.decisions,[]);
 m.setViewport(2560,1440,2);assert.equal(m.effective.maxOutputPixels,2560*1440);assert.equal(m.effective.portalLongEdge,1024);
});
test('showcase learns fast cadence without capping frames; failed lower-detail trials restore the scene',()=>{
 const m=new GraphicsQualityModel(GRAPHICS_PRESETS.showcase);m.setViewport(1920,1080);let t=drive(m,10000,1000/90);assert.equal(m.snapshot().adaptation.targetFps,60);assert.ok(m.stats.fps>80);
 drive(m,48000,22,t);assert.equal(m.portalScale,1);assert.equal(m.scale,1);assert.ok(m.decisions.some(d=>d.action==='probe-restored'));assert.equal(m.effective.maxOutputPixels,1920*1080);
 m.setViewport(1280,720);assert.equal(m.snapshot().adaptation.targetFps,30);assert.deepEqual(m.decisions,[]);
});
test('showcase keeps lower portal resolution only after repeatable improvement on the same screen resolution',()=>{
 const m=new GraphicsQualityModel(GRAPHICS_PRESETS.showcase);m.setViewport(1920,1080);let t=drive(m,10000,1000/60);drive(m,25000,()=>m.portalScale<1?17:23,t);assert.ok(m.decisions.some(d=>d.action==='probe-improved'&&d.kind==='portal'));assert.equal(m.scale,1);
});

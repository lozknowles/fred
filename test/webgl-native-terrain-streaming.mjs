import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {T} from '../src/world-runtime/vendor/world-engine-contract.js';
import {webGLNativeTerrainTile,updateWebGLNativeTerrainSeam} from '../src/world-runtime/WebGLNativeIsland.js';

// Frozen pre-optimization builder, including JS index arrays and tiny .set arrays.
function original(data,tile,step=1){
 const nx=Math.ceil(tile.width/step)+1,nz=Math.ceil(tile.height/step)+1,positions=new Float32Array(nx*nz*3),uv=new Float32Array(nx*nz*2),indices=[];
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const gx=Math.min(data.res-1,tile.x+Math.min(tile.width,x*step)),gz=Math.min(data.res-1,tile.z+Math.min(tile.height,z*step)),i=z*nx+x;positions.set([data.origin+(gx+.5)*data.texel,data.heights[gz*data.res+gx],data.origin+(gz+.5)*data.texel],i*3);uv.set([x/(nx-1),z/(nz-1)],i*2);if(x<nx-1&&z<nz-1)indices.push(i,i+nx,i+1,i+1,i+nx,i+nx+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function dataFor(res=384){return{res,origin:-192.25,texel:.875,heights:new Float32Array(res*res).fill(-3)};}
function apply(data,tile,revision=0){for(let z=0;z<tile.height;z++)for(let x=0;x<tile.width;x++){const gx=tile.x+x,gz=tile.z+z;data.heights[gz*data.res+gx]=Math.sin(gx*.071)*13+Math.cos(gz*.043)*8+gx*gz*.0007+revision;}}
function equalGeometry(a,b){for(const key of ['position','normal','uv'])assert.deepEqual(a.attributes[key].array,b.attributes[key].array,key);assert.equal(a.index.array.constructor,b.index.array.constructor);assert.deepEqual(a.index.array,b.index.array);a.computeBoundingBox();a.computeBoundingSphere();b.computeBoundingBox();b.computeBoundingSphere();assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);}
const tiles=Array.from({length:9},(_,i)=>({id:String(i),x:i%3*128,z:Math.floor(i/3)*128,width:128,height:128}));

test('typed builder exactly preserves Float32 positions, normals, UV, index type and bounds',()=>{
 for(const [res,width,height,step] of [[384,128,128,1],[384,256,256,1],[384,137,119,7],[128,128,128,1]]){
  const d=dataFor(res),tile={x:0,z:0,width,height};apply(d,{...tile,width:Math.min(width,res),height:Math.min(height,res)});
  const a=original(d,tile,step),b=webGLNativeTerrainTile(d,tile,step);equalGeometry(a,b);a.dispose();b.dispose();
 }
});

test('nonflat shuffled arrivals, corners, edges and changed reloads preserve resident buffers exactly',()=>{
 const data=dataFor(),resident=new Map();let updates=0;
 for(const [id,revision] of [[4,0],[0,0],[8,0],[2,0],[6,0],[1,0],[7,0],[3,0],[5,0],[4,0],[4,1]]){
  const incoming=tiles[id];resident.get(id)?.dispose();resident.delete(id); // eviction leaves captured CPU heights as before
  apply(data,incoming,revision);resident.set(id,webGLNativeTerrainTile(data,incoming));
  for(const [otherId,g] of resident){
   const position=g.attributes.position,normal=g.attributes.normal,index=g.index,uv=g.attributes.uv,version=position.version;
   const changed=updateWebGLNativeTerrainSeam(data,tiles[otherId],g,incoming);updates+=Number(changed);
   assert.equal(g.attributes.position,position);assert.equal(g.attributes.normal,normal);assert.equal(g.index,index);assert.equal(g.attributes.uv,uv);
   assert.equal(position.version,version+Number(changed));
   const expected=original(data,tiles[otherId]);equalGeometry(g,expected);expected.dispose();
   assert.equal(updateWebGLNativeTerrainSeam(data,tiles[otherId],g,incoming),false);
  }
 }
 assert.ok(updates>0);for(const g of resident.values())g.dispose();
});

// Explicit CPU benchmark; no browser, GPU or FPS claim. Matches original onLoad:
// new tile plus rebuilding all resident +/-128 neighbors, including the new tile.
if(process.argv.includes('--benchmark')){
 function run(optimized){const d=dataFor(),resident=new Map();let builds=0,seams=0;const start=performance.now();for(const incoming of tiles){apply(d,incoming);resident.set(incoming.id,optimized?webGLNativeTerrainTile(d,incoming):original(d,incoming));builds++;for(const other of tiles){const g=resident.get(other.id);if(!g)continue;if(optimized){seams+=Number(updateWebGLNativeTerrainSeam(d,other,g,incoming));}else if(Math.abs(other.x-incoming.x)<=128&&Math.abs(other.z-incoming.z)<=128){g.dispose();resident.set(other.id,original(d,other));builds++;}}}const ms=performance.now()-start;for(const g of resident.values())g.dispose();return{ms,builds,seams};}
 for(let i=0;i<3;i++){run(false);run(true);}const old=[],next=[];for(let i=0;i<9;i++){old.push(run(false));next.push(run(true));}const median=a=>a.map(v=>v.ms).sort((a,b)=>a-b)[4];console.log(JSON.stringify({cpuNine128Tiles:{originalMedianMs:median(old),optimizedMedianMs:median(next),originalBuilds:old[0].builds,optimizedBuilds:next[0].builds,changedSeams:next[0].seams}}));
}

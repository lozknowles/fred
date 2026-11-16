import test from 'node:test';
import assert from 'node:assert/strict';
import {PublishedPreviewQueue,previewRank} from '../src/world-runtime/PublishedPreviewQueue.js';
import {verifyPublishedData,restorePublishedData,publishedLandscapeChunks} from '../src/world-runtime/PublishedAdmissionData.js';
import {admitPublishedWorld} from '../src/world-runtime/PublishedAdmission.js';
import {createWorld,packWorldRepository,repositoryDigest,loadWorldSource,describeRuntimeWorld,landscapeChunks} from '../src/world-runtime/vendor/world-engine-contract.js';
const near={id:'near',position:[0,0,-4]},side={id:'side',position:[5,0,0]},behind={id:'behind',position:[0,0,4]},player={position:{x:0,z:0},yaw:0,velocity:{x:0,z:-1}};
test('focus and approach beat catalogue order; a pending preview does not block physical intent at the caller',async()=>{
 let now=0,release;const q=new PublishedPreviewQueue(()=>now),started=[],all=[behind,side,near].map(p=>previewRank(p,player,4));
 const start=p=>{started.push(p.id);return new Promise(r=>release=r);};
 q.update(all,start);now=180;q.update(all,start);assert.deepEqual(started,['near']);
 now=9000;q.update(all.slice(0,2),start);assert.equal(started.length,1);
 release();await Promise.resolve();q.update(all.slice(0,2),start);now+=660;q.update(all.slice(0,2),start);assert.deepEqual(started,['near','side']);
 release();await Promise.resolve();now+=660;q.update(all.slice(0,1),start);assert.deepEqual(started,['near','side','behind']);
});
test('walking away drops pending demand; stale completion cannot release a newer admission',async()=>{
 let now=0,resolveOld,resolveNew;const q=new PublishedPreviewQueue(()=>now),r=p=>[previewRank(p,player,4)];q.update(r(near),()=>{});now=200;q.update([],()=>assert.fail());assert.equal(q.waiting.size,0);
 q.update(r(side),()=>{});now=390;q.update(r(side),()=>new Promise(r=>resolveOld=r));q.reset();q.update(r(near),()=>{});now+=180;q.update(r(near),()=>new Promise(r=>resolveNew=r));const busy=q.busy;resolveOld();await Promise.resolve();assert.equal(q.busy,busy);resolveNew();await Promise.resolve();assert.equal(q.busy,null);
});
test('only a sustained new close aim overtakes an in-flight admission; other nearby doors cannot stampede',async()=>{
 let now=0;const q=new PublishedPreviewQueue(()=>now),releases=[],opened=[];
 const row=(portal,facing,distance)=>({portal,facing,distance,approach:0}),a=row(near,1,4),b=row(side,.75,5),c=row(behind,.5,6);
 const go=p=>{opened.push(p.id);return new Promise(r=>releases.push(r));};
 q.update([a,b,c],go);now=161;q.update([a,b,c],go);
 now=700;q.update([b,c],go,[a,b,c]);assert.deepEqual(opened,['near']);
 const turn=[{...a,facing:.6},{...b,facing:1},c];now=750;q.update(turn.slice(1),go,turn);now=850;q.update(turn.slice(1),go,turn);assert.equal(opened.length,1);
 now=931;q.update(turn.slice(1),go,turn);assert.deepEqual(opened,['near','side']);
 releases[1]();await Promise.resolve();const third={...c,facing:1};now=2000;q.update([third],go,[third]);now=2200;q.update([third],go,[third]);assert.equal(opened.length,2);
 releases[0]();await Promise.resolve();now+=651;q.update([third],go,[third]);assert.deepEqual(opened,['near','side','behind']);
});
async function fixture(){const world=createWorld('Pinned fixture'),files=await packWorldRepository(world),entry={worldId:world.metadata.worldId,contentDigest:await repositoryDigest(files.get('world.json')),bundlePath:'worlds/fixture/'},source={kind:'local',label:'fixture',read:async path=>{if(!files.has(path))throw Error('Unknown fixture path');return files.get(path);}};return {files,entry,source};}
test('cross-thread structured clone preserves canonical descriptor, terrain, collisions and admitted landscape',async()=>{
 const {entry,source}=await fixture(),ref=await loadWorldSource(source),d=describeRuntimeWorld(ref.project),wire=structuredClone(await verifyPublishedData(source,entry)),{loaded,descriptor}=restorePublishedData(wire,source,entry);
 assert.equal(loaded.contentDigest,ref.contentDigest);assert.deepEqual(loaded.project,ref.project);assert.deepEqual(descriptor.boxes,d.boxes);assert.deepEqual(descriptor.interactions,d.interactions);
 assert.deepEqual(publishedLandscapeChunks(descriptor.project),landscapeChunks(d.project));for(const [x,z] of [[0,0],[20,-12]])assert.equal(descriptor.terrain.heightAt(x,z),d.terrain.heightAt(x,z));
 await assert.rejects(verifyPublishedData(source,{...entry,contentDigest:'0'.repeat(64)}),/identity/);
 assert.throws(()=>restorePublishedData(wire,source,{...entry,worldId:'wrong'}),/identity/);
});
test('cancelled admission and corrupted component bytes cannot turn into a ready package',async()=>{
 const {source,entry,files}=await fixture(),bad=new Map(files),p=[...bad.keys()].find(k=>k.endsWith('/objects.json'));bad.set(p,new Uint8Array([123,125]));await assert.rejects(verifyPublishedData({...source,read:async k=>bad.get(k)},entry));
 const controller=new AbortController();controller.abort();await assert.rejects(admitPublishedWorld(entry,{baseURL:'https://example.test/',fetcher:()=>assert.fail(),signal:controller.signal}),{name:'AbortError'});
});

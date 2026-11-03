import test from 'node:test';
import assert from 'node:assert/strict';
import {RepositoryFederation} from '../network/repository-federation.mjs';
import {broadcastRepositoryPresence} from '../tools/networking/repository-world-server.mjs';
import {MAX_BUFFERED_BYTES} from '../tools/networking/RoomSecurity.mjs';

function fixture(count){
 let now=1000;
 const f=Object.create(RepositoryFederation.prototype);
 f.worlds=new Map(['alpha','beta','empty'].map(worldId=>[worldId,{worldId}]));
 f.now=()=>now;f.members=new Map();const peers=new Map();
 for(let i=0;i<count;i++){
  const nodeId='player-'+i,worldId=i%2?'beta':'alpha';
  f.members.set(nodeId,{nodeId,playerId:nodeId,label:nodeId,worldId,position:[i,0,0],velocity:[0,0,0],yaw:0,sequence:i,at:900,generation:0,appearance:{style:'male'},views:new Set([worldId])});
  peers.set(nodeId,{readyState:1,bufferedAmount:0,messages:[],send(data){this.messages.push(data);},terminate(){this.terminated=true;}});
 }
 return {f,peers,tick:n=>now+=n};
}
test('empty, single and ten-peer broadcasts preserve per-subscription wire values',()=>{
 for(const count of [0,1,10]){
  const {f,peers}=fixture(count);
  if(count)f.members.values().next().value.views.add('empty');
  const expected=new Map([...peers.keys()].map(node=>[node,[...f.members.get(node).views].map(worldId=>JSON.stringify({type:'presence',worldId,players:f.presence(worldId)}))]));
  let calls=0;const original=f.presence.bind(f);f.presence=id=>{calls++;return original(id);};
  broadcastRepositoryPresence(f,peers);
  assert.equal(calls,count===0?0:count===1?2:3);
  for(const [node,peer] of peers)assert.deepEqual(peer.messages,expected.get(node));
 }
});
test('mixed subscriptions never fan out unsubscribed worlds and retain independent backpressure',()=>{
 const {f,peers}=fixture(4);
 f.members.get('player-0').views.add('beta');
 peers.get('player-0').bufferedAmount=MAX_BUFFERED_BYTES;
 peers.get('player-1').readyState=3;
 peers.set('missing-member',{readyState:1,bufferedAmount:0,send(){throw Error('Unauthenticated peer sent data');}});
 broadcastRepositoryPresence(f,peers);
 assert.equal(peers.get('player-0').terminated,true);
 assert.deepEqual(peers.get('player-0').messages,[]);
 assert.deepEqual(peers.get('player-1').messages,[]);
 assert.deepEqual(peers.get('player-2').messages.map(JSON.parse).map(p=>p.worldId),['alpha']);
 assert.deepEqual(peers.get('player-3').messages.map(JSON.parse).map(p=>p.worldId),['beta']);
});
test('each broadcast refreshes accepted timestamps, transfer membership and presentation expiry',()=>{
 const {f,peers,tick}=fixture(2),s=f.members.get('player-0');
 s.presentation={expiresAt:1050};f.members.get('player-1').views.add('alpha');
 broadcastRepositoryPresence(f,peers);
 assert.deepEqual(JSON.parse(peers.get('player-0').messages[0]).players[0].presentation,{expiresAt:1050});
 tick(50);s.position=[4,0,0];s.at=1050;s.worldId='beta';s.generation=1;s.views=new Set(['beta']);
 broadcastRepositoryPresence(f,peers);
 const next=JSON.parse(peers.get('player-0').messages[1]);
 assert.equal(next.worldId,'beta');assert.equal(next.players[0].timestamp,1050);assert.equal(next.players[0].generation,1);assert.equal(next.players[0].presentation,undefined);assert.deepEqual(next.players[0].position,[4,0,0]);
 assert.deepEqual(JSON.parse(peers.get('player-1').messages.at(-1)).players,[]);
 s.disconnectedAt=1050;broadcastRepositoryPresence(f,peers);
 assert.equal(JSON.parse(peers.get('player-1').messages.at(-2)).players.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnookerDrill,strikeSnooker,stepSnooker,snookerMoving} from '../src/world-runtime/SnookerPhysics.js';

function play(index,fps,offset=0,power){
 const drill=createSnookerDrill(index);
 assert.equal(strikeSnooker(drill,drill.aim+offset,power??drill.power),true);
 assert.equal(strikeSnooker(drill,0,1),false);
 const events=[];
 for(let i=0;i<fps*12&&snookerMoving(drill);i++)events.push(...stepSnooker(drill,1/fps));
 assert.equal(snookerMoving(drill),false);
 return events;
}
for(const fps of [25,60,144]){
 test('double into corner at '+fps+' FPS',()=>assert.deepEqual(play(0,fps),[
  {type:'contact',ball:'cue',other:'red'},{type:'cushion',ball:'red',axis:'z'},{type:'pocket',ball:'red',pocket:5}]));
 test('plant into middle at '+fps+' FPS',()=>assert.deepEqual(play(1,fps),[
  {type:'contact',ball:'cue',other:'pink'},{type:'contact',ball:'pink',other:'red'},{type:'pocket',ball:'red',pocket:4}]));
}
test('a player can miss by changing power and aim',()=>{
 const events=play(0,25,Math.PI/2,.14);
 assert.equal(events.some(e=>e.type==='pocket'),false);
 assert.equal(events.some(e=>e.type==='contact'),false);
});

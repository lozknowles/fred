import test from 'node:test';
import assert from 'node:assert/strict';
import {DefenderPlayer,DEFENDER_VIDEO,defenderVolume} from '../src/world-runtime/DefenderPlayer.js';

function setup(){
 const video={paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},removeAttribute(){},load(){}};
 const sources=[];
 const mock=()=>({dispose(){}});
 const cabinet={speakerPosition:[0,0,0],screen:{material:{color:{set(){}}}}};
 const player=new DefenderPlayer(cabinet,{makeVideo:()=>video,makeTexture:mock,loadPoster:path=>{sources.push(path);return mock();}});
 return {player,video,sources};
}
test('table starts one recording, then challenge, then a silent still',()=>{
 const {player,video,sources}=setup();
 player.update({x:7,y:0,z:0});assert.equal(video.paused,true);
 player.playAtTable();assert.equal(player.phase,'game');assert.equal(video.src,DEFENDER_VIDEO);assert.equal(video.loop,false);assert.equal(video.muted,false);
 assert.ok(video.volume>0&&video.volume<defenderVolume(1));
 player.cabinetAction();assert.equal(video.muted,true);player.cabinetAction();assert.equal(video.muted,false);
 video.onended();assert.equal(player.phase,'challenge');assert.match(video.src,/challenge.mp4$/);assert.equal(video.muted,true);
 video.onended();assert.equal(player.phase,'finished');assert.equal(video.paused,true);assert.match(sources.at(-1),/challenge.jpg$/);
 player.playAtTable();assert.equal(video.paused,true);player.dispose();player.dispose();
});
test('world exit cuts audio and a deliberate cabinet press can replay',()=>{
 const {player,video}=setup();player.cabinetAction();player.update(null);
 assert.equal(player.phase,'idle');assert.equal(video.muted,true);assert.equal(video.paused,true);
 player.cabinetAction();assert.equal(video.src,DEFENDER_VIDEO);assert.equal(video.muted,false);player.dispose();
});

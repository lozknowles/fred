import assert from 'node:assert/strict';
import test from 'node:test';
import {updateRepositoryHud} from '../src/world-runtime/RepositoryHud.js';

test('HUD updates the text node only when its displayed state changes',()=>{
 let value='',writes=0;
 const hud={get textContent(){return value;},set textContent(text){value=text;writes++;}};
 const active={project:{metadata:{name:'Warehouse'}},player:{mode:'walk',position:{x:2,y:-1.23,z:5.51}}};

 updateRepositoryHud(hud,null,'',false);
 assert.equal(value,'Open a repository to explore');
 for(let i=0;i<120;i++)updateRepositoryHud(hud,active,' · E: use computer','Blocked by a column');
 assert.equal(value,'Warehouse · walk · 2.0, -1.2, 5.5 · E: use computer · Blocked by a column');
 assert.equal(writes,2);

 active.player.position.z=5.62;
 updateRepositoryHud(hud,active,'','');
 assert.equal(value,'Warehouse · walk · 2.0, -1.2, 5.6');
 assert.equal(writes,3);
});

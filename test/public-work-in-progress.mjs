import test from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('public entry, world chooser and credits identify Work in Progress without changing attribution',()=>{
 for(const p of ['index.html','worlds.html','public/credits.html','public/opening-credits.html']){
  const s=read(p);assert.match(s,/<title>Work in Progress[^<]*<\/title>/);assert.doesNotMatch(s,/<(?:h1|title|small)>[^<]*\bFred\b/i);
 }
 assert.match(read('index.html'),/<small>Work in Progress · Loz's World<\/small><h1>Warehouse Island<\/h1>/);
 assert.match(read('public/opening-credits.html'),/Fred engine licence \(MIT\)/);
 assert.match(read('src/world-runtime/main.js'),/report\('Work in Progress · '\+selected\.backend/);
});

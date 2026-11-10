import test from 'node:test';
import assert from 'node:assert/strict';
import {bbcProgramURL,BBC_GRAPHICS_PROGRAM} from '../src/world-runtime/MicroComputerGuest.js';

test('BBC startup uses the provider keyboard for a multiline program and RUN',()=>{
 const u=new URL(bbcProgramURL(BBC_GRAPHICS_PROGRAM.replaceAll('\n','\r\n')));
 assert.equal(u.origin,'https://bbc.xania.org');
 assert.equal(u.searchParams.get('model'),'B');
 assert.equal(u.searchParams.get('autotype'),BBC_GRAPHICS_PROGRAM+'\nRUN\n');
 assert.equal(u.searchParams.has('embedBasic'),false);
 assert.match(u.href,/%26/);
 assert.match(bbcProgramURL('10 PRINT 2+3'),/%2B/);
 for(const text of ['','10 PRINT\u0000','X'.repeat(2049)])assert.throws(()=>bbcProgramURL(text));
});

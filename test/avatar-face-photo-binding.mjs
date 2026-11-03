import test from 'node:test';
import assert from 'node:assert/strict';
import {attachLocalFacePhotoStore} from '../src/player/AvatarChooser.js';

test('the local player restores its saved face without changing an open editor draft',()=>{
	let notify,unsubscribed=false,saved={version:1,dataUrl:'synthetic'},renders=[];
	const chooser={app:{avatar:{}},dialog:{open:false},updateFacePreview(){renders.push(this.faceDraft);}};
	const off=attachLocalFacePhotoStore(chooser,()=>saved,callback=>{notify=callback;return ()=>{unsubscribed=true;};});
	assert.deepEqual(renders,[saved]);
	chooser.dialog.open=true;saved=null;notify();
	assert.equal(renders.length,1);
	chooser.dialog.open=false;notify();
	assert.equal(renders.at(-1),null);
	off();assert.equal(unsubscribed,true);
});
test('there is no storage binding for a stand-alone editor without its own player',()=>{
	let reads=0;attachLocalFacePhotoStore({app:null},()=>{reads++;},()=>{throw Error('unexpected subscription');})();
	assert.equal(reads,0);
});

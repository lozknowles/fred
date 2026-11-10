import test from 'node:test';
import assert from 'node:assert/strict';
import {SunGuestConsole,sunGuestSocketURL} from '../src/world-runtime/SunGuestConsole.js';
function fixture(){
 let active=true,focused=true,allowed=true;const requests=[],sockets=[],written=[];
 const mount={classList:{add(){},remove(){}},replaceChildren(){}};
 const doc={visibilityState:'visible',hasFocus:()=>focused,createElement:()=>({style:{},setAttribute(){},getContext:()=>({fillRect(){},fillText(){},drawImage(){}})})};
 const terminal={options:{},rows:24,buffer:{active:{viewportY:0,getLine(){}}},parser:{registerOscHandler:()=>({dispose(){}})},open(){},onData(fn){this.data=fn;return {dispose(){}}},onRender(){return {dispose(){}}},focus(){},dispose(){this.disposed=true;},write(data,done){written.push(new TextDecoder().decode(data));done();}};
 const app={document:doc,window:{location:{origin:'http://localhost:5189'}},mount,status:{textContent:''},isActive:()=>active,canExecute:()=>allowed,canCommand:()=>allowed,loadTerminal:async()=>({terminal,fit:{fit(){}}}),onRevoked:()=>{active=false;console.close();},fetch:async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>path.endsWith('session')?{available:true,systems:['netbsd'],csrf:'csrf'}:path.endsWith('start')?{sessionId:'guest',ticket:'one-use',wsPath:'/api/period-sun/ws'}:{ok:true}};},WebSocket:class{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;}}};
 const console=new SunGuestConsole(app);return {console,app,terminal,requests,sockets,written,blur:()=>{focused=false;},revoke:()=>{allowed=false;},deactivate:()=>{active=false;}};
}
test('SPARC websocket is local, exact path, and carries a one-time ticket',()=>{
 const value=new URL(sunGuestSocketURL('/api/period-sun/ws','https://fred.test','a','b'));
 assert.equal(value.origin,'wss://fred.test');assert.equal(value.searchParams.get('ticket'),'b');
 for(const path of ['https://evil.test/api/period-sun/ws','/api/ai-terminal/ws','/api/period-sun/ws?ticket=evil','/api/period-sun/ws#x'])assert.throws(()=>sunGuestSocketURL(path,'https://fred.test','a','b'));
});
test('real serial bytes, blur input gating and revocation teardown',async t=>{
 const f=fixture();t.after(()=>f.console.dispose());await f.console.open();await f.console.start('netbsd');const socket=f.sockets[0];
 assert.equal(f.requests[1].options.headers['x-fred-sun-token'],'csrf');assert.deepEqual(JSON.parse(f.requests[1].options.body),{system:'netbsd'});
 await f.console.receive({data:JSON.stringify({type:'ready'})},socket,f.console.generation);
 await f.console.receive({data:JSON.stringify({type:'output',data:Buffer.from('/bin/sh: root filesystem\r\n').toString('base64')})},socket,f.console.generation);assert.equal(f.written[0],'/bin/sh: root filesystem\r\n');
 await f.console.send('ls /\r',f.console.generation);assert.equal(Buffer.from(socket.sent.find(m=>m.type==='input').data,'base64').toString(),'ls /\r');
 f.blur();f.console.syncInput();assert.equal(f.terminal.options.disableStdin,true);await f.console.send('blocked',f.console.generation);assert.equal(socket.sent.filter(m=>m.type==='input').length,1);
 f.revoke();await f.console.authorized(f.console.generation);assert.equal(socket.closed,true);assert.equal(f.terminal.disposed,true);assert.ok(f.requests.some(r=>r.path.endsWith('/end')));
});
test('late guest start after Leave is terminated and never attached',async t=>{
 const f=fixture();t.after(()=>f.console.dispose());await f.console.open();const fetch=f.app.fetch;let resolve;
 f.console.fetch=async(path,options)=>path.endsWith('start')?new Promise(r=>{resolve=r;}):fetch(path,options);
 const pending=f.console.start('netbsd');while(!resolve)await new Promise(r=>setImmediate(r));f.console.close();
 resolve({ok:true,json:async()=>({sessionId:'late',ticket:'t',wsPath:'/api/period-sun/ws'})});await pending;assert.equal(f.sockets.length,0);assert.ok(f.requests.some(r=>r.path.endsWith('/end')&&JSON.parse(r.options.body).sessionId==='late'));
});
test('Sun display accepts only bounded JPEG frames from the current authenticated guest',async t=>{
 const f=fixture();t.after(()=>f.console.dispose());await f.console.open();await f.console.start('netbsd');const socket=f.sockets[0],g=f.console.generation;await f.console.receive({data:'{"type":"ready"}'},socket,g);f.console.setView('display');
 assert.ok(socket.sent.some(m=>m.type==='display'&&m.enabled));assert.equal(f.terminal.options.disableStdin,true);
 let draws=0,closed=0;f.console.frameCanvas.getContext=()=>({drawImage(){draws++;},fillRect(){}});f.app.decodeFrame=async()=>({width:640,height:480,close(){closed++;}});
 const frame={type:'frame',format:'jpeg',width:640,height:480,data:Buffer.from([255,216,255,217]).toString('base64')};
 await f.console.receive({data:JSON.stringify(frame)},socket,g);assert.equal(draws,1);assert.equal(closed,1);assert.equal(f.console.frameCanvas.width,640);
 await assert.rejects(f.console.receive({data:JSON.stringify({...frame,width:2000})},socket,g));
 await assert.rejects(f.console.receive({data:JSON.stringify({...frame,data:'https://other.test/frame.jpg'})},socket,g));
 f.blur();f.console.syncInput();assert.ok(socket.sent.some(m=>m.type==='display'&&!m.enabled));await f.console.receive({data:JSON.stringify(frame)},socket,g);assert.equal(draws,1);
});
test('decoded frame from an ended guest cannot appear in a later view',async t=>{
 const f=fixture();t.after(()=>f.console.dispose());await f.console.open();await f.console.start('netbsd');const socket=f.sockets[0],g=f.console.generation;f.console.ready=true;f.console.setView('display');let resolve,closed=0,draws=0;f.console.frameCanvas.getContext=()=>({drawImage(){draws++;},fillRect(){}});f.app.decodeFrame=()=>new Promise(r=>{resolve=r;});
 const pending=f.console.receiveFrame({type:'frame',format:'jpeg',width:640,height:480,data:Buffer.from([255,216,255,217]).toString('base64')},socket,g);f.console.close();resolve({width:640,height:480,close(){closed++;}});await pending;assert.equal(draws,0);assert.equal(closed,1);
});
test('End OS session cancels an in-flight boot and cleans its late server session',async t=>{
 const f=fixture();t.after(()=>f.console.dispose());await f.console.open();const fetch=f.app.fetch;let resolve;
 f.console.fetch=async(path,options)=>path.endsWith('start')?new Promise(r=>{resolve=r;}):fetch(path,options);
 const pending=f.console.start('netbsd');while(!resolve)await new Promise(r=>setImmediate(r));await f.console.end();
 resolve({ok:true,json:async()=>({sessionId:'cancelled',ticket:'t',wsPath:'/api/period-sun/ws'})});await pending;assert.equal(f.sockets.length,0);assert.ok(f.requests.some(r=>r.path.endsWith('/end')&&JSON.parse(r.options.body).sessionId==='cancelled'));
});

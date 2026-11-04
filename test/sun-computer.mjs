import test from 'node:test';
import assert from 'node:assert/strict';
import {SunComputer,officialTerminalAuthURL} from '../src/world/SunComputer.js';
import {SunTerminalScreen} from '../src/world/SunTerminalScreen.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const encoded=text=>Buffer.from(text).toString('base64');
function dom(){
 const doc={visibilityState:'visible',events:new Map(),addEventListener(k,v){this.events.set(k,v);},removeEventListener(k){this.events.delete(k);},exitPointerLock(){}};
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners=new Map();this.style={};this.textContent='';}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn,opts){this.listeners.set(k,{fn,opts});}focus(){doc.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;}remove(){this.removed=true;}
  getContext(){return this.ctx??=( {texts:[],fillRect(){this.texts=[];},fillText(value){this.texts.push(value);}} );}
 }
 doc.createElement=tag=>new Element(tag);doc.body=new Element('body');
 const win={location:{origin:'https://fred.test'},events:new Map(),opened:[],addEventListener(k,v){this.events.set(k,v);},removeEventListener(k){this.events.delete(k);},open(...args){this.opened.push(args);}};
 return {doc,win};
}
class Terminal{
 constructor(){this.options={};this.cols=80;this.rows=24;this.written=[];this.lines=[];this.parser={registerOscHandler:(code,handler)=>{this.oscCode=code;this.osc=handler;return {dispose:()=>{this.osc=null;}};}};this.buffer={active:{viewportY:0,getLine:n=>({translateToString:()=>this.lines[n]??''})}};}
 attachCustomKeyEventHandler(fn){this.keyHandler=fn;}open(mount){this.mount=mount;}focus(){this.focused=true;}
 onData(fn){this.data=fn;return {dispose:()=>{this.data=null;}};}onRender(fn){this.render=fn;return {dispose:()=>{this.render=null;}};}onResize(fn){this.resize=fn;return {dispose:()=>{this.resize=null;}};}
 write(bytes,done){this.written.push(new TextDecoder().decode(bytes));done?.();this.render?.();}dispose(){this.disposed=true;this.written=[];}
}
function fixture(overrides={}){
 const {doc,win}=dom(),requests=[],sockets=[],terminals=[];let execute=true,command=true,now=1000;
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}send(value){this.sent.push(JSON.parse(value));}close(){this.closed=true;this.readyState=3;}
  open(){this.readyState=1;this.onopen?.();}message(value){return this.onmessage?.({data:JSON.stringify(value)});}
 }
 const fetch=async(path,options)=>{
  requests.push({path,options});let result;
  if(path.endsWith('/session'))result={available:true,providers:['codex','claude'],csrf:'memory-token'};
  else if(path.endsWith('/end'))result={ok:true};
  else result={sessionId:'private-session',attachment:'one-time-capability',provider:path.endsWith('/start')?JSON.parse(options.body).provider:'codex',expiresIn:60};
  return {ok:true,status:200,json:async()=>result};
 };
 const app={document:doc,window:win,fetch,WebSocket:Socket,now:()=>now,input:{suspended:0,resumed:0,locked:0,suspend(){this.suspended++;},resume(){this.resumed++;},requestLock(){this.locked++;}},canResume:()=>true,canExecute:async()=>execute,canCommand:async()=>command,loadTerminal:async()=>{const terminal=new Terminal();terminals.push(terminal);return {terminal,fit:{fit(){}}};},...overrides};
 const computer=new SunComputer(app);
 return {computer,app,doc,win,requests,sockets,terminals,setExecute:value=>{execute=value;},setCommand:value=>{command=value;},setNow:value=>{now=value;}};
}
async function connected(f){await f.computer.open();assert.equal(await f.computer.connect(),true);const socket=f.sockets.at(-1);socket.open();await socket.message({type:'ready'});return socket;}

test('Sun auth links allow exact official HTTPS hosts only; no ports or credentials',()=>{
 for(const host of ['auth.openai.com','chatgpt.com','claude.ai','console.anthropic.com'])assert.equal(officialTerminalAuthURL('https://'+host+'/login?q=1').host,host);
 for(const value of ['http://auth.openai.com/','https://auth.openai.com.evil.test/','https://user@claude.ai/','https://chatgpt.com:443/','javascript:alert(1)','https://console%2eanthropic.com/','https://claude.ai./'])assert.equal(officialTerminalAuthURL(value),null,value);
});
test('Sun capability offline/no endpoint remains honest and never starts a CLI',async t=>{
 for(const mode of ['unavailable','missing','network']){
  const f=fixture({fetch:async()=>{if(mode==='network')throw Error('Network unavailable');return {ok:mode!=='missing',status:404,json:async()=>({available:false})};}});t.after(()=>f.computer.dispose());
  await f.computer.open();assert.equal(f.computer.active,true);assert.equal(f.computer.connectButton.disabled,true);assert.equal(await f.computer.connect(),false);assert.equal(f.sockets.length,0);assert.match(f.computer.status.textContent,/unavailable/i);assert.equal(f.app.input.suspended,1);
 }
});
test('Sun connects actual provider contract, forwards bounded UTF8 input and output, and guards clipboard',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());const socket=await connected(f),computer=f.computer;
 assert.equal(socket.url,'wss://fred.test/api/ai-terminal/ws');assert.deepEqual(socket.sent[0],{type:'attach',sessionId:'private-session',attachment:'one-time-capability'});
 const start=f.requests.find(r=>r.path.endsWith('/start'));assert.equal(start.options.headers['X-Fred-Terminal-Token'],'memory-token');assert.deepEqual(JSON.parse(start.options.body),{provider:'codex',cols:80,rows:24});assert.equal(start.options.credentials,'same-origin');
 assert.match(computer.status.textContent,/Connected to live codex/);
 await computer.enqueueInput('WASD\r\x03😀');const input=socket.sent.find(m=>m.type==='input');assert.equal(Buffer.from(input.data,'base64').toString(),'WASD\r\x03😀');assert.equal(f.app.input.resumed,0);
 await computer.enqueueInput('x'.repeat(9000));assert.ok(socket.sent.filter(m=>m.type==='input').every(m=>Buffer.from(m.data,'base64').length<=4096));
 await socket.message({type:'output',data:encoded('\x1b[31mreal CLI output\x1b[0m')});assert.equal(computer.terminal.written[0],'\x1b[31mreal CLI output\x1b[0m');
 assert.equal(computer.terminal.oscCode,52);assert.equal(computer.terminal.osc('clipboard-secret'),true);
 assert.equal(computer.terminal.keyHandler,undefined,'native user paste/copy and Ctrl-C remain available');let clipboardStopped=0;for(const name of ['paste','copy','cut'])computer.dialog.listeners.get(name).fn({stopPropagation(){clipboardStopped++;},preventDefault(){assert.fail('explicit user clipboard action was blocked');}});assert.equal(clipboardStopped,3);
 const inputCount=socket.sent.length;await computer.enqueueInput('x'.repeat(65537));assert.equal(socket.sent.length,inputCount);assert.match(computer.status.textContent,/64 KiB/);
 let stopped=0;computer.dialog.listeners.get('keydown').fn({stopPropagation(){stopped++;}});computer.dialog.listeners.get('keyup').fn({stopPropagation(){stopped++;}});assert.equal(stopped,2);
});
test('Sun supports Claude selection and end only reports signout after server acknowledgement',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());await f.computer.open();f.computer.provider.value='claude';await f.computer.connect();assert.equal(JSON.parse(f.requests.at(-1).options.body).provider,'claude');const socket=f.sockets[0];socket.open();await socket.message({type:'ready'});assert.match(f.computer.status.textContent,/claude/);
 await f.computer.endSession();assert.equal(socket.closed,true);assert.equal(f.computer.session,null);assert.equal(f.computer.terminal,null);assert.match(f.computer.status.textContent,/ended and local sign-in removed/);assert.equal(f.computer.connectButton.disabled,false);
});
test('Sun leave clears private data and socket, resumes input, and only memory session identity can reattach',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());const socket=await connected(f),computer=f.computer,terminal=computer.terminal;
 await socket.message({type:'output',data:encoded('Open https://auth.openai.com/login?code=private\r\n')});assert.equal(computer.links.children.length,1);assert.equal(computer.links.children[0].textContent,'Open official sign-in page · auth.openai.com');assert.equal(computer.openAuthLink('https://attacker.test/'),false);computer.links.children[0].onclick({preventDefault(){}});assert.match(f.win.opened[0][2],/noopener/);
 computer.close();assert.equal(socket.closed,true);assert.equal(computer.csrf,null);assert.equal(computer.capabilities,null);assert.equal(computer.linkTail,'');assert.equal(computer.authLinks,null);assert.equal(computer.links.children.length,0);assert.equal(computer.terminal,null);assert.equal(terminal.disposed,true);assert.equal(computer.display.open,false);assert.equal(computer.active,false);assert.equal(f.app.input.resumed,1);assert.equal(f.app.input.locked,1);assert.equal(computer.session.sessionId,'private-session');assert.equal('attachment' in computer.session,false);
 await computer.open();assert.equal(computer.resumeButton.disabled,false);await computer.connect(true);assert.ok(f.requests.some(r=>r.path.endsWith('/attach')));assert.equal(f.sockets.length,2);
});
test('Sun rejects stale start/output and closes immediately on revoked command/execute authority',async t=>{
 const start=deferred(),f=fixture();t.after(()=>f.computer.dispose());const original=f.app.fetch;f.computer.fetch=async(path,opts)=>path.endsWith('/start')?start.promise:original(path,opts);
 await f.computer.open();const connecting=f.computer.connect();await tick();f.computer.close({resume:false});start.resolve({ok:true,json:async()=>({sessionId:'old',provider:'codex',attachment:'secret'})});await connecting;assert.equal(f.sockets.length,0);assert.equal(f.computer.session,null);assert.equal(f.computer.csrf,null);
 const g=fixture();t.after(()=>g.computer.dispose());const socket=await connected(g),oldHandler=socket.onmessage;g.setCommand(false);await g.computer.enqueueInput('must not run');assert.equal(g.computer.active,false);assert.equal(socket.closed,true);assert.equal(g.computer.session,null);assert.equal(socket.sent.filter(m=>m.type==='input').length,0);
 await oldHandler({data:JSON.stringify({type:'output',data:encoded('secret stale output')})});assert.equal(g.computer.terminal,null);assert.equal(g.computer.links.children.length,0);
 const h=fixture();t.after(()=>h.computer.dispose());await connected(h);h.setExecute(false);await h.computer.authorized(h.computer.generation);assert.equal(h.computer.active,false);assert.equal(h.computer.display.open,false);assert.equal(h.app.input.resumed,0);
});
test('Sun awaits authority for queued input and cannot send stale input into a new socket',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());const socket=await connected(f),permission=deferred();f.app.canCommand=()=>permission.promise;
 const input=f.computer.enqueueInput('old command');await tick();f.computer.disconnect();permission.resolve(true);await input;assert.equal(socket.sent.some(m=>m.type==='input'),false);
});
test('Sun protects simultaneous connect, malformed messages and split auth URLs; blur clears local screen',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());await f.computer.open();const [a,b]=await Promise.all([f.computer.connect(),f.computer.connect()]);assert.equal([a,b].filter(Boolean).length,1);assert.equal(f.requests.filter(r=>r.path.endsWith('/start')).length,1);const socket=f.sockets[0];socket.open();await socket.message({type:'ready'});
 await socket.message({type:'output',data:encoded('https://auth.openai.com/oauth?cod')});assert.equal(f.computer.links.children.length,0);await socket.message({type:'output',data:encoded('e=complete\r\nhttps://evil.test/login\r\n')});assert.equal(f.computer.links.children.length,1);assert.match(f.computer.links.children[0].href,/code=complete/);
 await socket.message({type:'output',data:'invalid!'});assert.equal(f.computer.terminal.written.length,2);assert.match(f.computer.status.textContent,/Invalid terminal output/);
 f.win.events.get('blur')();assert.equal(f.computer.display.open,false);f.win.events.get('focus')();assert.equal(f.computer.display.open,true);
 f.doc.visibilityState='hidden';f.doc.events.get('visibilitychange')();assert.equal(f.computer.socket,null);assert.equal(f.computer.csrf,null);assert.ok(f.computer.session,'browser sign-in tab can return to resumable session');assert.equal(f.app.input.resumed,0);
 assert.equal(f.computer.active,true);assert.equal(f.computer.dialog.open,true);assert.equal(f.computer.terminal,null);f.doc.visibilityState='visible';f.doc.events.get('visibilitychange')();await tick();assert.equal(f.computer.resumeButton.disabled,false);assert.equal(f.computer.csrf,'memory-token');await f.computer.connect(true);assert.equal(f.sockets.length,2);assert.equal(f.app.input.resumed,0);f.computer.close();assert.equal(f.app.input.resumed,1,'Leave after browser auth return restores game input');
});
test('Sun physical canvas draws only bounded visible buffer, dirty-only at 10Hz, idle clears on close',()=>{
 const {doc}=dom();let now=0,dirty=0;const screen=new SunTerminalScreen({document:doc,now:()=>now,onDirty:()=>dirty++}),terminal=new Terminal();terminal.lines=['x'.repeat(200),'private visible output'];screen.attach(terminal);assert.equal(screen.draw(),false);now=100;assert.equal(screen.draw(),true);assert.ok(screen.ctx.texts.includes('x'.repeat(80)));assert.equal(screen.ctx.texts.includes('x'.repeat(200)),false);const count=dirty;now=1000;assert.equal(screen.draw(),false);assert.equal(dirty,count);screen.clear();assert.equal(screen.terminal,null);assert.equal(screen.ctx.texts.some(line=>line.includes('private visible output')),false);assert.ok(screen.ctx.texts.includes('Sun workstation'));screen.dispose();
});
test('Sun stale terminal initialization is disposed and expired resume never reconnects implicitly',async t=>{
 const loading=deferred(),f=fixture({loadTerminal:()=>loading.promise});t.after(()=>f.computer.dispose());await f.computer.open();const pending=f.computer.connect();await tick();f.computer.close();const terminal=new Terminal();loading.resolve({terminal,fit:{fit(){}}});assert.equal(await pending,false);assert.equal(terminal.disposed,true);assert.equal(f.sockets.length,0);
 const g=fixture();t.after(()=>g.computer.dispose());await connected(g);g.computer.close();g.setNow(62000);await g.computer.open();assert.equal(g.computer.session,null);assert.equal(g.computer.resumeButton.disabled,true);assert.equal(g.sockets.length,1);
});
test('Sun websocket handshake rechecks authority and failed end cannot claim successful signout',async t=>{
 const f=fixture();t.after(()=>f.computer.dispose());await f.computer.open();await f.computer.connect();f.setExecute(false);const socket=f.sockets[0];socket.open();await tick();assert.equal(socket.sent.length,0);assert.equal(socket.closed,true);assert.equal(f.computer.active,false);
 const g=fixture();t.after(()=>g.computer.dispose());await connected(g);const original=g.computer.fetch;g.computer.fetch=async(path,options)=>path.endsWith('/end')?{ok:false,status:503}:original(path,options);assert.equal(await g.computer.endSession(),false);assert.ok(g.computer.session);assert.match(g.computer.status.textContent,/Could not confirm sign out/);
});

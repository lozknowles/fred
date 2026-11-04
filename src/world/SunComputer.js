import {SunTerminalScreen} from './SunTerminalScreen.js';

const AUTH_HOSTS=new Set(['auth.openai.com','chatgpt.com','claude.ai','console.anthropic.com']);
const PROVIDERS=new Set(['codex','claude']);
const MAX_INPUT=4096,MAX_OUTPUT_BASE64=131072;
export function officialTerminalAuthURL(value){
 try{const u=new URL(value);const authority=/^https:\/\/([^/?#]+)/i.exec(value)?.[1];
  return u.protocol==='https:'&&AUTH_HOSTS.has(u.hostname)&&!u.username&&!u.password&&authority?.toLowerCase()===u.hostname?u:null;
 }catch{return null;}
}
async function loadTerminal(){
 const [{Terminal},{FitAddon}]=await Promise.all([import('@xterm/xterm'),import('@xterm/addon-fit')]);
 const terminal=new Terminal({cols:80,rows:24,scrollback:2000,convertEol:false,allowProposedApi:false,
  allowTransparency:false,disableStdin:false,screenReaderMode:true,fontFamily:'monospace',fontSize:15,
  theme:{background:'#101b1c',foreground:'#d9efdc',cursor:'#ffffff'}});
 const fit=new FitAddon();terminal.loadAddon(fit);return {terminal,fit};
}
const base64=bytes=>{let value='';for(const b of bytes)value+=String.fromCharCode(b);return globalThis.btoa(value);};
function outputBytes(data){
 if(typeof data!=='string'||data.length>MAX_OUTPUT_BASE64||data.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))throw Error('Invalid terminal output');
 return Uint8Array.from(globalThis.atob(data),c=>c.charCodeAt(0));
}
/** Official provider CLIs only. No transcript, CSRF token or login data is persisted. */
export class SunComputer {
 constructor(app){
  this.app=app;this.doc=app.document??globalThis.document;this.win=app.window??globalThis.window;
  this.fetch=app.fetch??globalThis.fetch.bind(globalThis);this.WebSocket=app.WebSocket??globalThis.WebSocket;
  this.loadTerminal=app.loadTerminal??loadTerminal;this.now=app.now??(()=>Date.now());
  this.active=false;this.generation=0;this.session=null;this.csrf=null;this.socket=null;this.terminal=null;this.inputQueue=Promise.resolve();this.disposed=false;
  this.display=new SunTerminalScreen({document:this.doc,onDirty:canvas=>app.onScreen?.(canvas,true)});
  const el=(tag,text,parent)=>{const node=this.doc.createElement(tag);if(text)node.textContent=text;parent?.append(node);return node;};
  this.dialog=el('dialog');this.dialog.className='elsemesh-sun-terminal';this.dialog.setAttribute('aria-label','Sun workstation AI terminal');
  const style=el('style',null,this.dialog);style.textContent='.elsemesh-sun-terminal{box-sizing:border-box;width:min(1100px,96vw);height:min(840px,94dvh);max-height:94dvh;padding:16px;background:#a7aaa5;color:#172321;border:5px ridge #e0e2dc;font:15px system-ui}.elsemesh-sun-terminal::backdrop{background:#000b}.elsemesh-sun-shell{height:100%;display:flex;flex-direction:column;gap:10px}.elsemesh-sun-title{margin:0;background:#4c5853;color:white;padding:8px;font:bold 20px monospace}.elsemesh-sun-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.elsemesh-sun-tools button,.elsemesh-sun-tools select{font:inherit;min-height:44px;padding:8px}.elsemesh-sun-output{flex:1;min-height:160px;min-width:0;background:#101b1c;overflow:hidden;padding:4px}.elsemesh-sun-links{max-height:90px;overflow:auto;overflow-wrap:anywhere}.elsemesh-sun-links a{display:block;color:#003f75}.elsemesh-sun-status{margin:0;overflow-wrap:anywhere}.elsemesh-sun-help{margin:0;font-size:13px}@media(max-width:600px){.elsemesh-sun-terminal{padding:8px;width:98vw;height:96dvh;max-height:96dvh}.elsemesh-sun-tools{gap:4px}.elsemesh-sun-tools button{padding:7px}}';
  const shell=el('section',null,this.dialog);shell.className='elsemesh-sun-shell';const title=el('h2','Sun workstation · OpenWindows',shell);title.className='elsemesh-sun-title';
  const tools=el('div',null,shell);tools.className='elsemesh-sun-tools';const label=el('label','AI provider ',tools);
  this.provider=el('select',null,label);this.provider.setAttribute('aria-label','AI provider');for(const [id,name]of [['codex','Codex'],['claude','Claude']]){const option=el('option',name,this.provider);option.value=id;}this.provider.value='codex';
  const button=(text,fn)=>{const node=el('button',text,tools);node.type='button';node.onclick=fn;return node;};
  this.connectButton=button('Connect',()=>this.connect(false));this.resumeButton=button('Resume session',()=>this.connect(true));this.endButton=button('End session and sign out',()=>this.endSession());this.leaveButton=button('Leave',()=>this.close());
  this.status=el('p','Disconnected',shell);this.status.className='elsemesh-sun-status';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  const help=el('p','Live official CLI. Sign in in the provider browser page; paste its authorization code here only when the official CLI asks. User paste and selected-text copy are available; automatic clipboard access is blocked. Leave disconnects this screen; resume within 60 seconds. Temporary work is deleted when you end the session or it expires (30 minutes). End session removes sign-in from this temporary workstation, not your other devices.',shell);help.className='elsemesh-sun-help';
  this.links=el('div',null,shell);this.links.className='elsemesh-sun-links';this.links.setAttribute('aria-label','Official provider sign-in links');
  this.mount=el('div',null,shell);this.mount.className='elsemesh-sun-output';this.mount.setAttribute('aria-label','Live private terminal');
  this.dialog.addEventListener('keydown',e=>e.stopPropagation());this.dialog.addEventListener('keyup',e=>e.stopPropagation());
  // Native user gestures stay inside the terminal; OSC52 cannot access clipboard.
  for(const event of ['paste','copy','cut'])this.dialog.addEventListener(event,e=>e.stopPropagation());
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});this.doc.body.append(this.dialog);
  this.resize=()=>this.fitTerminal();this.win.addEventListener('resize',this.resize);
  this.visibility=()=>{
   if(!this.active)return;
   if(this.doc.visibilityState==='hidden'){
    ++this.generation;this.disconnect();this.clearTerminal();this.csrf=null;this.capabilities=null;this.busy=false;this.inputQueue=Promise.resolve();this.outputQueue=Promise.resolve();this.outputBudget={bytes:0};
    if(this.session)this.session.resumeUntil=this.now()+60000;this.setStatus('Disconnected while hidden. Return here to resume within 60 seconds.');this.updateButtons();
   }else void this.refreshCapabilities(this.generation);
  };this.doc.addEventListener('visibilitychange',this.visibility);
  this.blur=()=>this.display.clear();this.focus=()=>{if(this.active&&this.terminal)this.display.attach(this.terminal);};this.win.addEventListener('blur',this.blur);this.win.addEventListener('focus',this.focus);
  this.updateButtons();
 }
 getDisplayCanvas(){return this.display.getDisplayCanvas();}
 setStatus(text){this.status.textContent=text;}
 current(generation){return this.active&&!this.disposed&&generation===this.generation;}
 async authorized(generation,command=false){
  if(!this.current(generation))return false;
  let allowed=false;try{allowed=(await this.app.canExecute?.())!==false;if(command&&allowed)allowed=(await this.app.canCommand?.())!==false;}catch{allowed=false;}
  if(!this.current(generation))return false;if(!allowed){this.close({resume:false});return false;}return true;
 }
 updateButtons(){
  const connected=!!this.socket,busy=!!this.busy,available=!!this.capabilities?.available&&!!this.csrf;
  this.connectButton.disabled=!this.active||!available||busy||connected||!!this.session;
  this.resumeButton.disabled=!this.active||!available||busy||connected||!this.session||this.session.resumeUntil<this.now();
  this.endButton.disabled=!this.active||!this.session||busy||!this.csrf;this.provider.disabled=busy||connected||!!this.session;
 }
 async request(path,body,generation){
  const csrf=this.csrf;
  const response=await this.fetch('/api/ai-terminal/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:body?{'Content-Type':'application/json','X-Fred-Terminal-Token':csrf}:{},...(body?{body:JSON.stringify(body)}:{})});
  if(!this.current(generation))return null;
  if(!response.ok){const error=Error(response.status===404?'AI terminal is unavailable on this server.':'The AI terminal request failed.');error.status=response.status;throw error;}
  return response.json();
 }
 async open(){
  if(this.active||this.disposed)return;const generation=++this.generation;this.active=true;this.busy=false;this.csrf=null;this.capabilities=null;this.inputQueue=Promise.resolve();this.outputBudget={bytes:0};
  this.app.input.suspend();this.doc.exitPointerLock?.();this.dialog.showModal();this.provider.focus();this.setStatus('Checking live AI terminal availability…');this.updateButtons();
  this.heartbeat=setInterval(()=>{if(this.authorityPending)return;this.authorityPending=true;this.authorized(this.generation).finally(()=>{this.authorityPending=false;});this.display.draw();},100);
  if(!await this.authorized(generation))return;
  return this.refreshCapabilities(generation);
 }
 async refreshCapabilities(generation=this.generation){
  if(!await this.authorized(generation))return;
  try{const result=await this.request('session',null,generation);if(!this.current(generation)||!result)return;
   if(result.available!==true||typeof result.csrf!=='string'||!result.csrf||!Array.isArray(result.providers))throw Error('AI terminal is unavailable on this server.');
   this.capabilities={...result,providers:result.providers.filter(p=>PROVIDERS.has(p))};this.csrf=result.csrf;
   for(const option of this.provider.children)option.disabled=!this.capabilities.providers.includes(option.value);
   if(!this.capabilities.providers.includes(this.provider.value))this.provider.value=this.capabilities.providers[0]??'';
   if(this.session&&this.session.resumeUntil<this.now())this.session=null;
   this.setStatus(this.session?'Disconnected. Resume your existing '+this.session.provider+' session.':'Ready to connect to an official provider CLI.');this.updateButtons();
  }catch(error){if(this.current(generation)){this.csrf=null;this.setStatus(error.message);this.updateButtons();}}
 }
 async ensureTerminal(generation){
  if(this.terminal)return true;const loaded=await this.loadTerminal();
  if(!this.current(generation)){loaded.terminal.dispose();return false;}
  this.terminal=loaded.terminal;this.fit=loaded.fit;this.terminal.options.linkHandler={activate:(_event,url)=>this.openAuthLink(url)};
  // Only deliberate native paste/copy gestures are allowed. Remote OSC52 never
  // reads or writes the clipboard; no clipboard addon is loaded.
  this.osc=this.terminal.parser.registerOscHandler(52,()=>true);
  this.terminal.open(this.mount);this.dataListener=this.terminal.onData(data=>this.enqueueInput(data,generation));
  this.renderListener=this.terminal.onRender(()=>this.display.markDirty());this.resizeListener=this.terminal.onResize(size=>this.sendResize(size,generation));
  this.display.attach(this.terminal);this.fitTerminal();return true;
 }
 fitTerminal(){if(!this.active||!this.terminal)return;try{this.fit?.fit();const size=this.dimensions();if(this.terminal.cols!==size.cols||this.terminal.rows!==size.rows)this.terminal.resize?.(size.cols,size.rows);}catch{}this.display.markDirty();}
 async connect(resume=false){
  const generation=this.generation;if(this.busy||this.socket||!this.capabilities?.available||!this.csrf)return false;
  if(!await this.authorized(generation,true))return false;
  if(this.busy||this.socket)return false;
  const provider=resume?this.session?.provider:this.provider.value;if(!PROVIDERS.has(provider)||!this.capabilities.providers.includes(provider)||(!resume&&this.session)||(resume&&!this.session))return false;
  this.busy=true;this.updateButtons();this.setStatus(resume?'Resuming live terminal…':'Starting '+provider+' official CLI…');
  try{
   if(!await this.ensureTerminal(generation)||!await this.authorized(generation,true))return false;
   const dimensions=this.dimensions();
   const result=await this.request(resume?'attach':'start',resume?{sessionId:this.session.sessionId}:{provider,...dimensions},generation);
   if(!this.current(generation)||!result)return false;
   if(typeof result.sessionId!=='string'||typeof result.attachment!=='string'||result.provider!==provider)throw Error('Invalid terminal session response.');
   this.session={sessionId:result.sessionId,provider,resumeUntil:this.now()+60000};
   if(!await this.authorized(generation,true))return false;
   const url=new URL('/api/ai-terminal/ws',this.win.location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   const socket=new this.WebSocket(url.href);this.socket=socket;
   socket.onopen=async()=>{if(this.socket!==socket||!await this.authorized(generation,true)||this.socket!==socket){socket.close();return;}socket.send(JSON.stringify({type:'attach',sessionId:result.sessionId,attachment:result.attachment}));};
   socket.onmessage=event=>this.receive(event,socket,generation);
   socket.onclose=()=>{if(this.socket!==socket||!this.current(generation))return;this.socket=null;this.session.resumeUntil=this.now()+60000;this.setStatus('Disconnected. Resume within 60 seconds.');this.clearTerminal();this.updateButtons();};
   socket.onerror=()=>{if(this.socket===socket&&this.current(generation))this.setStatus('Live terminal connection failed.');};
   this.setStatus('Connecting to live '+provider+' terminal…');return true;
  }catch(error){if(this.current(generation)){if(resume&&error.status===404){this.session=null;this.setStatus('Your previous session has expired or ended. Connect to begin a new session.');}else this.setStatus(error.message);this.clearTerminal();}return false;}
  finally{if(this.current(generation)){this.busy=false;this.updateButtons();}}
 }
 dimensions(){return {cols:Math.max(20,Math.min(300,this.terminal?.cols??80)),rows:Math.max(20,Math.min(300,this.terminal?.rows??24))};}
 enqueueInput(data,generation=this.generation){
  const sourceSocket=this.socket,sourceTerminal=this.terminal;
  this.inputQueue=this.inputQueue.then(async()=>{
   if(!await this.authorized(generation,true)||!this.ready||this.socket?.readyState!==1||this.socket!==sourceSocket||this.terminal!==sourceTerminal)return;
   const bytes=new TextEncoder().encode(data),socket=this.socket;
   if(bytes.length>MAX_INPUT*16){this.setStatus('Input is too large. Paste at most 64 KiB at a time.');return;}
   for(let offset=0;offset<bytes.length;offset+=MAX_INPUT){if(!this.current(generation)||this.socket!==socket)return;socket.send(JSON.stringify({type:'input',data:base64(bytes.subarray(offset,offset+MAX_INPUT))}));}
  }).catch(()=>{if(this.current(generation))this.setStatus('Terminal input failed.');});return this.inputQueue;
 }
 sendResize(_size,generation=this.generation){if(this.current(generation)&&this.ready&&this.socket?.readyState===1)this.socket.send(JSON.stringify({type:'resize',...this.dimensions()}));}
 receive(event,socket,generation){
  const length=typeof event.data==='string'?event.data.length:0;
  if(socket!==this.socket||!this.current(generation))return Promise.resolve();
  const budget=this.outputBudget??={bytes:0};
  if(budget.bytes+length>1048576){this.disconnect();this.clearTerminal();this.setStatus('Terminal output exceeded its buffer limit. Resume to reconnect.');this.updateButtons();return Promise.resolve();}
  budget.bytes+=length;
  this.outputQueue=(this.outputQueue??Promise.resolve()).then(()=>this.receiveMessage(event,socket,generation)).catch(()=>{if(this.current(generation))this.setStatus('Terminal connection failed.');}).finally(()=>{budget.bytes-=length;});return this.outputQueue;
 }
 async receiveMessage(event,socket,generation){
  if(socket!==this.socket||!await this.authorized(generation)||socket!==this.socket)return;
  let message;try{if(typeof event.data!=='string'||event.data.length>MAX_OUTPUT_BASE64+1024)throw Error();message=JSON.parse(event.data);}catch{this.setStatus('Invalid terminal message.');return;}
  if(message.type==='ready'){this.ready=true;this.setStatus('Connected to live '+this.session.provider+' CLI. Follow its official sign-in instructions.');this.sendResize(null,generation);this.terminal?.focus();}
  else if(message.type==='output'){
   try{const bytes=outputBytes(message.data);this.scanLinks(bytes);const terminal=this.terminal;if(terminal)await new Promise(resolve=>terminal.write(bytes,()=>{if(this.current(generation)&&terminal===this.terminal)this.display.markDirty();resolve();}));}catch{this.setStatus('Invalid terminal output.');}
  }else if(message.type==='exit'){this.setStatus('Provider CLI exited'+(Number.isInteger(message.code)?' ('+message.code+')':'')+'.');this.disconnect();this.session=null;this.clearTerminal();this.updateButtons();}
  else if(message.type==='error')this.setStatus('Terminal server reported an error. Disconnect and retry.');
 }
 scanLinks(bytes){
  this.decoder??=new TextDecoder();const text=(this.linkTail??'')+this.decoder.decode(bytes,{stream:true});this.linkTail=text.slice(-2048);
  this.authLinks??=new Set();for(const match of text.matchAll(/https:\/\/[^\s\x00-\x20<>"']+(?=[\s\x00-\x20<>"'])/g)){
   const raw=match[0].replace(/[).,;]+$/,'');const url=officialTerminalAuthURL(raw);if(!url||this.authLinks.has(url.href)||this.authLinks.size>=6)continue;
   this.authLinks.add(url.href);const link=this.doc.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open official sign-in page · '+url.host;link.onclick=e=>{e.preventDefault();this.openAuthLink(url.href);};this.links.append(link);
  }
 }
 openAuthLink(raw){const url=officialTerminalAuthURL(raw);if(!this.active||!url)return false;this.win.open(url.href,'_blank','noopener,noreferrer');return true;}
 async endSession(){
  const generation=this.generation;if(this.busy||!this.session||!this.csrf||!await this.authorized(generation,true))return false;
  if(this.busy||!this.session)return false;
  this.busy=true;this.updateButtons();try{const result=await this.request('end',{sessionId:this.session.sessionId},generation);if(!this.current(generation)||!result)return false;if(result.ok!==true)throw Error('Sign out was not confirmed.');
   this.disconnect();this.session=null;this.clearTerminal();this.setStatus('Session ended and local sign-in removed.');return true;
  }catch(error){if(this.current(generation)){if(error.status===404){this.disconnect();this.session=null;this.clearTerminal();this.setStatus('Your previous session has expired or ended. Connect to begin a new session.');}else this.setStatus('Could not confirm sign out. Retry End session.');}return false;}
  finally{if(this.current(generation)){this.busy=false;this.updateButtons();}}
 }
 disconnect(){const socket=this.socket;this.socket=null;this.ready=false;if(socket){socket.onopen=socket.onmessage=socket.onerror=socket.onclose=null;socket.close(1000,'View disconnected');}}
 clearTerminal(){
  for(const item of [this.dataListener,this.renderListener,this.resizeListener,this.osc])item?.dispose();this.dataListener=this.renderListener=this.resizeListener=this.osc=null;
  this.terminal?.dispose();this.terminal=null;this.fit=null;this.mount.replaceChildren();this.links.replaceChildren();this.authLinks=null;this.linkTail='';this.decoder=null;this.display.clear();
 }
 close({resume=true,keepSession=resume}={}){
  if(!this.active)return;this.active=false;++this.generation;clearInterval(this.heartbeat);this.heartbeat=null;this.disconnect();this.clearTerminal();this.csrf=null;this.capabilities=null;this.busy=false;this.inputQueue=Promise.resolve();this.outputQueue=Promise.resolve();this.outputBudget={bytes:0};
  if(this.session)this.session.resumeUntil=this.now()+60000;if(!keepSession)this.session=null;this.setStatus('Disconnected');this.dialog.close();this.updateButtons();
  if(resume&&(this.app.canResume?.()??true)){this.app.input.resume();this.app.input.requestLock();}
 }
 dispose(){this.close({resume:false});this.disposed=true;this.session=null;this.win.removeEventListener('resize',this.resize);this.win.removeEventListener('blur',this.blur);this.win.removeEventListener('focus',this.focus);this.doc.removeEventListener('visibilitychange',this.visibility);this.dialog.remove();this.display.dispose();}
}

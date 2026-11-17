import { createMicroGuest, C64_SNAKE, BBC_GRAPHICS_PROGRAM } from './MicroComputerGuest.js';
import { SunComputer } from '../world/SunComputer.js';
import { SunGuestConsole } from './SunGuestConsole.js';

/** Public/local period computers. Owner input remains in the mediated legacy clients. */
export class PeriodComputer {
 constructor(app,kind){
  this.app=app;this.kind=kind;this.doc=app.document??globalThis.document;this.win=app.window??globalThis.window;this.active=false;this.generation=0;
  const el=(tag,text,parent)=>{const n=this.doc.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
  this.dialog=el('dialog');this.dialog.className='fred-period-computer';this.dialog.dataset.kind=kind;this.dialog.setAttribute('aria-label',kind==='c64'?'Commodore 64':kind==='bbc'?'BBC Micro Model B':'Sun SPARCstation');
  el('style',`.fred-period-computer{box-sizing:border-box;width:min(1200px,98vw);height:min(920px,96dvh);max-height:96dvh;padding:16px;border:8px ridge #d3c7aa;background:#282a29;color:#f5efde;font:15px system-ui}.fred-period-computer::backdrop{background:#000c}.fred-period-shell{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}.fred-period-tools{display:flex;flex-wrap:wrap;gap:8px}.fred-period-computer button{min-height:44px;padding:9px 14px;font:inherit;background:#e7ddc5;color:#17211f;border:2px outset #fff2d0}.fred-period-computer h2,.fred-period-computer p{margin:0}.fred-period-mount{flex:1;min-height:100px;position:relative;overflow:auto}.fred-period-mount iframe{width:100%;height:100%;min-height:360px;border:0}.fred-period-mount pre{white-space:pre-wrap}.fred-period-status{min-height:1.4em}.fred-period-code{font:14px monospace;white-space:pre-wrap;background:#060b09;padding:8px;color:#d0f7c9}.fred-period-console{height:100%;background:#101b1c;overflow:hidden}.fred-period-computer button:focus-visible{outline:3px solid #5fe1ff;outline-offset:2px}`,this.dialog);
  const shell=el('section',null,this.dialog);shell.className='fred-period-shell';el('h2',kind==='c64'?'Commodore 64 · BASIC V2':kind==='bbc'?'BBC Micro · Model B':'Sun SPARCstation · operating system',shell);
  this.tools=el('nav',null,shell);this.tools.className='fred-period-tools';this.tools.setAttribute('aria-label','Computer controls');
  this.button=(text,fn)=>{const n=el('button',text,this.tools);n.type='button';n.onclick=fn;return n;};
  this.leave=this.button('Leave computer',()=>this.close());
  this.status=el('p','',shell);this.status.className='fred-period-status';this.status.setAttribute('role','status');
  el('p',kind==='sun'?'Boot NetBSD/SPARC to use a disposable Sun workstation. End OS session discards your changes.':'Click the emulated screen to type. These computers do not need a game login. Use Leave computer above to return; an emulator may capture Escape. Switching away stops the guest; reopen it to restart.',shell);
  if(kind==='bbc'){
   const detail=el('details',null,shell);el('summary','Edit the BBC BASIC program',detail);
   this.program=el('textarea',null,detail);this.program.setAttribute('aria-label','BBC BASIC program');this.program.rows=7;this.program.spellcheck=false;
   this.program.style.cssText='width:100%;box-sizing:border-box;font:15px monospace';this.program.value=BBC_GRAPHICS_PROGRAM;
   el('p','Run BBC program boots a fresh Model B, types these lines on its keyboard, then enters RUN.',detail);
  }
  this.mount=el('div',null,shell);this.mount.className='fred-period-mount';
  if(kind==='sun'){
   this.os=new SunGuestConsole({...app,document:this.doc,window:this.win,mount:this.mount,status:this.status,isActive:()=>this.active,onRevoked:()=>this.close({resume:false})});
   this.netbsd=this.button('Boot NetBSD/SPARC',()=>this.os.start('netbsd'));this.netbsd.disabled=true;
   this.sunos=this.button('Boot my SunOS disk',()=>this.os.start('sunos'));this.sunos.hidden=true;
   this.button('Console',()=>this.os.setView('console'));
   this.button('Sun display',()=>this.os.setView('display'));
   if(this.win.location?.hostname==='127.0.0.1'||this.win.location?.hostname==='localhost')this.button('AI terminal',()=>{this.close({resume:false});this.ai??=new SunComputer(this.app);void this.ai.open();});
   this.button('End OS session',()=>this.os.end());
  }else{
   this.button('Reset computer',()=>this.guest?.reset());
   if(kind==='bbc')this.button('Run BBC program',()=>{
    if(!this.guest)return;
    try{this.guest.runProgram(this.program.value);this.status.textContent='The Model B is typing the program. RUN follows the last line.';this.guest.focus();}
    catch(error){this.status.textContent=error.message;}
   });
   if(kind==='c64')this.button('Load Snake game',()=>{this.guest?.loadGame?.();this.status.textContent='Snake · '+C64_SNAKE.controls;this.guest?.focus();});
  }
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});for(const event of ['keydown','keyup','paste','copy','cut'])this.dialog.addEventListener(event,e=>e.stopPropagation());
  this.blur=()=>{if(!this.active||(this.doc.visibilityState!=='hidden'&&(this.doc.hasFocus?.()??false)))return;if(this.kind!=='sun'){this.guest?.dispose();this.guest=null;this.mount.replaceChildren();this.status.textContent='Computer stopped while this window was inactive. Leave and reopen to restart.';}else this.os.syncInput();};
  this.visibility=()=>{if(this.doc.visibilityState==='hidden')this.blur();else this.os?.syncInput();};this.focus=()=>this.os?.syncInput();
  this.win.addEventListener('blur',this.blur);this.win.addEventListener('focus',this.focus);this.doc.addEventListener('visibilitychange',this.visibility);this.doc.body.append(this.dialog);
 }
 get active(){return this._active||!!this.ai?.active;}
 set active(value){this._active=value;}
 async open(){if(this.active||this.disposed)return;this.active=true;const generation=++this.generation;this.app.input.suspend();this.doc.exitPointerLock?.();this.dialog.showModal();this.leave.focus();
  if(this.kind==='sun'){const capabilities=await this.os.open();if(!this.active||generation!==this.generation)return;this.netbsd.disabled=!capabilities?.systems?.includes('netbsd');this.sunos.hidden=!capabilities?.systems?.includes('sunos');}
  else {try{if((await this.app.canUsePeriodGuest?.())===false){this.status.textContent='Embedded emulator input is available only in the standalone tour and local preview.';return;}if(!this.active||generation!==this.generation)return;this.guest=createMicroGuest({kind:this.kind,document:this.doc,onStatus:state=>{if(state.state==='loaded'&&this.active&&generation===this.generation)this.guest?.focus();}});this.mount.replaceChildren(this.guest.element);this.guest.focus();this.status.textContent=this.kind==='c64'?'Real C64 emulator · type BASIC, or load the Snake game.':'Real BBC Model B emulator · type BBC BASIC at the prompt.';this.authorityTimer=setInterval(async()=>{if(this.authorityPending)return;this.authorityPending=true;try{const allowed=(await this.app.canUsePeriodGuest?.())!==false&&(await this.app.canExecute?.())!==false;if(generation===this.generation&&!allowed)this.close({resume:false});}catch{if(generation===this.generation)this.close({resume:false});}finally{this.authorityPending=false;}},200);}catch(error){this.status.textContent='Could not open emulator: '+error.message;}}
 }
 close({resume=true}={}){this.ai?.close({resume:false});if(!this._active)return;this.active=false;++this.generation;clearInterval(this.authorityTimer);this.guest?.dispose();this.guest=null;this.os?.close();this.mount.replaceChildren();this.dialog.close();if(resume&&(this.app.canResume?.()??true)){this.app.input.resume();this.app.input.requestLock();}}
 dispose(){this.close({resume:false});this.disposed=true;this.ai?.dispose();this.os?.dispose();this.win.removeEventListener('blur',this.blur);this.win.removeEventListener('focus',this.focus);this.doc.removeEventListener('visibilitychange',this.visibility);this.dialog.remove();}
}

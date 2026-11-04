/** Local-only view. The renderer must never publish/copy this canvas to peers. */
export class SunTerminalScreen {
 constructor({document:doc=globalThis.document,onDirty=()=>{},now=()=>performance.now()}={}){
  this.canvas=doc.createElement('canvas');this.canvas.width=1024;this.canvas.height=768;
  this.ctx=this.canvas.getContext('2d');this.onDirty=onDirty;this.now=now;this.open=false;this.dirty=true;this.lastDraw=-Infinity;this.terminal=null;this.clear();
 }
 getDisplayCanvas(){return this.canvas;}
 attach(terminal){this.terminal=terminal;this.open=true;this.markDirty();}
 markDirty(){this.dirty=true;}
 draw(){
  if(!this.dirty||this.now()-this.lastDraw<100)return false;
  const ctx=this.ctx;if(!ctx)return false;
  this.lastDraw=this.now();this.dirty=false;
  ctx.textBaseline='alphabetic';ctx.fillStyle='#a7aaa5';ctx.fillRect(0,0,1024,768);ctx.fillStyle='#e3e5df';ctx.fillRect(18,18,988,46);
  ctx.fillStyle='#202523';ctx.font='bold 23px monospace';ctx.fillText('OpenWindows · Sun workstation',32,49);
  ctx.fillStyle='#414a47';ctx.fillRect(34,90,956,38);ctx.fillStyle='#ffffff';ctx.font='19px monospace';ctx.fillText(this.open?'Private AI terminal':'Terminal · disconnected',48,117);
  ctx.fillStyle='#101b1c';ctx.fillRect(34,128,956,600);ctx.fillStyle='#d9efdc';ctx.font='18px monospace';ctx.textBaseline='top';
  if(this.open&&this.terminal){
   const buffer=this.terminal.buffer?.active;
   for(let row=0;row<24;row++){
    const line=buffer?.getLine((buffer.viewportY??0)+Math.max(0,(this.terminal.rows??24)-24)+row)?.translateToString(true,0,80)??'';
    // Render at most the 80x24 visible buffer, never scrollback or DOM/HTML.
    ctx.fillText(line.slice(0,80),48,143+row*23);
   }
  }else{ctx.fillText('Sun workstation',58,164);ctx.fillText('Open the computer to connect your AI account.',58,198);}
  this.onDirty(this.canvas);return true;
 }
 clear(){this.open=false;this.terminal=null;this.dirty=true;this.lastDraw=-Infinity;this.draw();}
 dispose(){this.clear();this.onDirty=()=>{};}
}

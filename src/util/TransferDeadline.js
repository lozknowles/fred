/** Bound response latency and stalls while allowing a large, progressing body.
 * The total cap prevents a slow trickle from keeping a transfer alive forever. */
export function transferDeadline(idleMs,{progressive=false,signal,message='Transfer deadline exceeded'}={}){
 const controller=new AbortController();let idleTimer,totalTimer;
 const expire=()=>controller.abort(Error(message));
 const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(expire,idleMs);};
 const abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 resetIdle();if(progressive)totalTimer=setTimeout(expire,Math.min(120000,8*idleMs));
 return {
  signal:controller.signal,
  progress(byteLength){if(progressive&&byteLength>0&&!controller.signal.aborted)resetIdle();},
  // Also bound adapters that do not reject their pending read on abort.
  async wait(operation){
   controller.signal.throwIfAborted();
   let rejectAbort;const aborted=new Promise((resolve,reject)=>{rejectAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAbort,{once:true});});
   try{return await Promise.race([operation(),aborted]);}finally{controller.signal.removeEventListener('abort',rejectAbort);}
  },
  dispose(){clearTimeout(idleTimer);clearTimeout(totalTimer);signal?.removeEventListener('abort',abort);controller.abort();},
 };
}

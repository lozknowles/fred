// Debug snapshots are sampled once on the first read after a completed frame.
// Call read() before activation invalidates the outgoing world's resources.
export class FrameDiagnostics {
 constructor(target,onError){this.pending=null;this.value=undefined;this.onError=onError;Object.defineProperty(target,'diagnostics',{enumerable:true,configurable:true,get:()=>this.read()});}
 publish(build){this.pending=build;}
 read(){const build=this.pending;if(build){this.pending=null;try{this.value=build();}catch(error){this.onError(error);}}return this.value;}
}

export function collectNeonDiagnostics(active){
 const neons=[];active?.root.traverse(node=>{if(node.userData.neonState)neons.push(node.userData.neonState);});return neons;
}

// Debug snapshots are sampled once on the first read after a completed frame.
// Flush pending work before activation or teardown invalidates scene resources.
export class FrameDiagnostics {
 constructor(target,onError){
  this.pending=null;
  this.value=undefined;
  this.onError=onError;
  Object.defineProperty(target,'diagnostics',{
   enumerable:true,
   configurable:true,
   get:()=>this.read(),
  });
 }

 publish(build){
  this.pending=build;
 }

 read(){
  const build=this.pending;
  if(build){
   // Consume before evaluating so repeated failed reads do not repeat failures.
   this.pending=null;
   try{
    this.value=build();
   }catch(error){
    this.onError(error);
   }
  }
  return this.value;
 }
}

export function collectNeonDiagnostics(active){
 const neons=[];
 active?.root.traverse(node=>{
  if(node.userData.neonState)neons.push(node.userData.neonState);
 });
 return neons;
}

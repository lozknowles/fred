// Observes accepted movement only; never participates in collision resolution.
export function walkingBlockContact(old, next, attempted, wish, contacts) {
 const dx=attempted.x-old.x,dz=attempted.z-old.z,length=Math.hypot(dx,dz);
 if(![dx,dz,wish.x,wish.z,next.x,next.z].every(Number.isFinite)||length<1e-5||Math.hypot(wish.x,wish.z)<.1)return null;
 // A successful tangential slide is ordinary movement, not a blocked path.
 if(Math.hypot(next.x-old.x,next.z-old.z)>length*.25)return null;
 let best=null,opposition=.5;
 for(const c of contacts){
  let [nx,nz]=c.normal;
  if(c.type==='box'){const b=c.collider;[nx,nz]=[nx*b.cos+nz*b.sin,-nx*b.sin+nz*b.cos];}
  const against=-(nx*dx+nz*dz)/length;
  if(c.penetration>1e-6&&against>opposition){best=c;opposition=against;}
 }
 return best?{kind:'solid',collider:best.collider}:null;
}
export function updateWalkingBlock(player, reason, dt) {
 const same=reason&&player._walkingBlockCandidate?.collider===reason.collider;
 player._walkingBlockTime=reason?(same?player._walkingBlockTime:0)+Math.max(0,Math.min(.1,dt)):0;
 player._walkingBlockCandidate=reason;
 player.walkingBlock=player._walkingBlockTime>=.18?reason:null;
}
// Only resolve names from this active, already admitted project. Never print
// collider keys, asset paths, object IDs, or arbitrary transport error details.
const messageCache=new WeakMap();
export function walkingBlockMessage(reason,project) {
 if(!project||typeof project!=='object')return '';
 if(reason?.kind!=='solid')return '';
 let cache=messageCache.get(project);if(!cache){cache=new Map();messageCache.set(project,cache);}
 const tag=reason.collider?.tag;
 if(cache.has(tag))return cache.get(tag);
 const message=resolveWalkingBlockMessage(reason,project);cache.set(tag,message);return message;
}
function resolveWalkingBlockMessage(reason,project) {
 if(reason?.kind!=='solid')return '';
 const object=project?.objects?.find(o=>o.id===reason.collider?.tag);
 if(!object)return 'Path blocked by solid geometry';
 if(object.collisionOnly===true&&/^warehouse:collision:mezzanine-rsj-(west|middle|center)$/.test(object.id)&&object.name==='Mezzanine RSJ structural post collision envelope')return 'Path blocked by Steel mezzanine post';
 if(object.collisionOnly===true)return 'Path blocked by solid geometry';
 const name=typeof object.name==='string'?object.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80):'';
 return name?`Path blocked by ${name}`:'Path blocked by solid geometry';
}

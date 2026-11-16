// One speculative admission at a time. Recompute demand every update so turning,
// walking away, disconnecting or replacing the world cannot leave queued work.
export class PublishedPreviewQueue {
 constructor(now=()=>performance.now()){this.now=now;this.waiting=new Map();this.busy=null;this.foreground=null;this.focus=null;this.next=0;this.started=0;this.last=null;}
 reset(){this.waiting.clear();this.busy=null;this.foreground=null;this.focus=null;this.next=0;this.last=null;}
 update(demand,start,attention=demand){
  const now=this.now(),ids=new Set(demand.map(x=>x.portal.id));
  for(const id of this.waiting.keys())if(!ids.has(id))this.waiting.delete(id);
  for(const {portal} of demand)if(!this.waiting.has(portal.id))this.waiting.set(portal.id,now);
  if(this.busy||this.foreground){
   // A cold room may take seconds. A sustained, tightly centred change of
   // target may overtake it once, but never open a general second queue.
   const aimed=attention.filter(r=>r.distance<=9&&r.facing>=.985).sort((a,b)=>a.distance-b.distance)[0];
   if(!aimed||!this.busy||this.busy.promoted||this.foreground||!ids.has(aimed.portal.id)){this.focus=null;return;}
   if(this.focus?.id!==aimed.portal.id){this.focus={id:aimed.portal.id,since:now};return;}
   if(now-this.focus.since<180)return;
   this.busy.promoted=true;this.launch(aimed.portal,start,'foreground');return;
  }
  this.focus=null;
  if(now<this.next||!demand.length)return;
  // Short dwell prevents an initial spawn tick or a flick across a doorway
  // from monopolising preparation. Age eventually outranks view direction.
  let best=null,high=-Infinity;
  for(const row of demand){
   const age=now-this.waiting.get(row.portal.id);if(age<160)continue;
   const score=3*row.facing+2*row.approach-row.distance/25+age/3000;
   if(score>high){high=score;best=row;}
  }
  if(!best)return;
  this.launch(best.portal,start,'busy');
 }
 launch(portal,start,slot){
  const token={};this[slot]=token;this.waiting.delete(portal.id);
  this.last=portal.id;this.started++;
  const settled=()=>{if(this[slot]===token){this[slot]=null;this.next=this.now()+650;}};
  try{Promise.resolve(start(portal)).then(settled,settled);}catch(e){settled();throw e;}
 }
}
export function previewRank(portal,player,distance){
 const x=portal.position[0]-player.position.x,z=portal.position[2]-player.position.z,r=Math.hypot(x,z)||1;
 const yaw=player.yaw??0,vx=player.velocity?.x??0,vz=player.velocity?.z??0,speed=Math.hypot(vx,vz);
 return {portal,distance,facing:(-Math.sin(yaw)*x-Math.cos(yaw)*z)/r,approach:speed>.1?(vx*x+vz*z)/(r*speed):0};
}

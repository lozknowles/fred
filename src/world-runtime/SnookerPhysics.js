// Metres in table-local X/Z. A 120 Hz clock makes the same stroke repeatable
// independently of render FPS. The fastest ball advances less than one radius.
export const SNOOKER_LENGTH=3.569, SNOOKER_WIDTH=1.778, BALL_RADIUS=.02625;
const end=SNOOKER_LENGTH/2, side=SNOOKER_WIDTH/2, tick=1/120;
export const SNOOKER_POCKETS=Object.freeze([[-end,-side],[0,-side],[end,-side],[-end,side],[0,side],[end,side]].map(Object.freeze));
const colours={cue:'#fcf5df',red:'#a90b21',blue:'#1861ad',pink:'#ef98ae',black:'#191819',yellow:'#e6b824',brown:'#774629',green:'#127744'};
const ball=(id,colour,x,z)=>({id,color:colours[colour],x,z,vx:0,vz:0,pocket:null});

export function createSnookerDrill(index=0){
 const bank=index%2===0;
 // The red doubles off the far long cushion. In the second setup the cue
 // strikes the pink and transfers momentum through a red into the middle.
 const aim=bank?-.916:Math.PI/2;
 const x=bank?-.55:0,z=bank?.13:-.35;
 const balls=[ball('cue','cue',x-.42*Math.cos(aim),z-.42*Math.sin(aim))];
 if(!bank)balls.push(ball('pink','pink',x,z));
 balls.push(ball('red','red',x,bank?z:.15));
 balls.push(ball('yellow','yellow',-1.05,-.48),ball('green','green',-1.05,.5),
  ball('brown','brown',-1.50,0),ball('blue','blue',.24,-.29),ball('black','black',1.31,-.13));
 return {balls,aim,power:bank?.98:.65,accumulator:0};
}
export function snookerMoving(drill){return drill.balls.some(b=>b.pocket===null&&(b.vx!==0||b.vz!==0));}
export function strikeSnooker(drill,angle,power){
 const cue=drill.balls.find(b=>b.id==='cue');
 if(!cue||cue.pocket!==null||snookerMoving(drill)||!Number.isFinite(angle)||!Number.isFinite(power)||power<=0)return false;
 const speed=Math.min(power,1)*2.85;
 cue.vx=speed*Math.cos(angle);cue.vz=speed*Math.sin(angle);return true;
}
function collide(a,b,events){
 const dx=b.x-a.x,dz=b.z-a.z,diameter=BALL_RADIUS*2,dist2=dx*dx+dz*dz;
 if(dist2>=diameter*diameter)return;
 const dist=Math.sqrt(dist2),nx=dist?dx/dist:1,nz=dist?dz/dist:0;
 const separation=(diameter-dist)/2;
 a.x-=nx*separation;a.z-=nz*separation;b.x+=nx*separation;b.z+=nz*separation;
 const approach=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
 if(approach<=0)return;
 const impulse=approach*.975;
 a.vx-=impulse*nx;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vz+=impulse*nz;
 events.push({type:'contact',ball:a.id,other:b.id});
}
function advance(b,events){
 const speed=Math.hypot(b.vx,b.vz);
 if(!speed)return;
 b.x+=b.vx*tick;b.z+=b.vz*tick;
 for(let i=0;i<SNOOKER_POCKETS.length;i++){
  const [px,pz]=SNOOKER_POCKETS[i];
  if(Math.hypot(b.x-px,b.z-pz)<.074){
   b.x=px;b.z=pz;b.vx=0;b.vz=0;b.pocket=i;
   events.push({type:'pocket',ball:b.id,pocket:i});return;
  }
 }
 const ax=Math.abs(b.x),az=Math.abs(b.z);
 const sideMouth=ax<.07||ax>end-.087, endMouth=az>side-.087;
 if(ax>end-BALL_RADIUS&&b.x*b.vx>0&&(!endMouth||ax>end+.018)){
  b.x=Math.sign(b.x)*(end-BALL_RADIUS);b.vx*=-.86;events.push({type:'cushion',ball:b.id,axis:'x'});
 }
 if(az>side-BALL_RADIUS&&b.z*b.vz>0&&(!sideMouth||az>side+.018)){
  b.z=Math.sign(b.z)*(side-BALL_RADIUS);b.vz*=-.86;events.push({type:'cushion',ball:b.id,axis:'z'});
 }
 const remaining=Math.max(0,1-.34*tick/speed);
 b.vx*=remaining;b.vz*=remaining;
}
export function stepSnooker(drill,dt){
 const events=[];
 if(!Number.isFinite(dt)||dt<=0)return events;
 drill.accumulator+=Math.min(dt,.25);
 while(drill.accumulator+1e-10>=tick){
  drill.accumulator-=tick;
  for(let i=0;i<drill.balls.length;i++){
   const a=drill.balls[i];if(a.pocket===null)advance(a,events);
  }
  for(let i=0;i<drill.balls.length;i++){
   const a=drill.balls[i];if(a.pocket!==null)continue;
   for(let j=i+1;j<drill.balls.length;j++){const b=drill.balls[j];if(b.pocket===null)collide(a,b,events);}
  }
 }
 return events;
}

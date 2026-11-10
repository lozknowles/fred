const smooth=value=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
const angle=(a,b,weight)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*weight;
export function canThumbsUp(player){return !!player&&player.mode==='walk'&&player.grounded!==false&&Math.hypot(player.velocity?.x??0,player.velocity?.z??0)<.1;}
export function thumbsUpWeight(time){return smooth(time/.9)*(1-smooth((time-5.8)/1.1));}
/** Local presentation only: never changes player position, input yaw, clips or network state. */
export class AvatarThumbsUp {
 constructor({engine:T,model,group}){
  this.T=T;this.model=model;this.group=group;this.bones=new Map();model.traverse(object=>this.bones.set(object.name.replaceAll('_',' '),object));
  this.get=name=>this.bones.get('Bip01 R '+name);this.arm=this.get('UpperArm');this.forearm=this.get('Forearm');this.hand=this.get('Hand');
  this.joints=[this.arm,this.forearm,this.hand,...[0,1,2,3,4].flatMap(i=>['','1','2'].map(suffix=>this.get('Finger'+i+suffix)))];
  this.available=this.joints.every(Boolean);this.originals=new Map();this.time=0;this.active=false;
 }
 trigger(player){if(this.active||!this.available||!canThumbsUp(player))return false;this.restore();this.active=true;this.time=0;this.context=player;this.position=player.position.clone();return true;}
 restore(){for(const [joint,quaternion]of this.originals)joint.quaternion.copy(quaternion);this.originals.clear();}
 cancel(){this.restore();this.active=false;this.weight=0;}
 face(dt,player,camera,normalYaw,{enabled=true}={}){
  if(!this.active)return normalYaw;
  if(!enabled||player!==this.context||!canThumbsUp(player)||player.position.distanceTo(this.position)>.08||!camera?.position){this.cancel();return normalYaw;}
  this.time+=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));this.weight=thumbsUpWeight(this.time);
  if(this.time>=6.9){this.cancel();return normalYaw;}
  const cameraYaw=Math.atan2(camera.position.x-this.group.position.x,camera.position.z-this.group.position.z);
  return angle(normalYaw,cameraYaw,this.weight);
 }
 aim(joint,child,target){
  const T=this.T;this.group.updateMatrixWorld(true);const origin=joint.getWorldPosition(new T.Vector3()),direction=child.getWorldPosition(new T.Vector3()).sub(origin).normalize(),wanted=target.clone().sub(origin).normalize();
  const world=joint.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(direction,wanted));
  const parent=joint.parent.getWorldQuaternion(new T.Quaternion()).invert();joint.quaternion.copy(parent.multiply(world));
 }
 apply(){
  if(!this.active||!this.available||!this.weight)return;
  const T=this.T;this.restore();for(const joint of this.joints)this.originals.set(joint,joint.quaternion.clone());
  this.group.updateMatrixWorld(true);
  const shoulder=this.arm.getWorldPosition(new T.Vector3()),elbow=this.forearm.getWorldPosition(new T.Vector3()),wrist=this.hand.getWorldPosition(new T.Vector3());
  const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(wrist),orientation=this.group.getWorldQuaternion(new T.Quaternion());
  // A bent elbow held naturally below/outside the shoulder; the fist is beside
  // the face and forward of the chest, clear of the face-photo geometry.
  const target=shoulder.clone().add(new T.Vector3(-.18,.13,.28).applyQuaternion(orientation));
  const direction=target.clone().sub(shoulder),distance=Math.min(upper+lower-.001,Math.max(Math.abs(upper-lower)+.001,direction.length()));direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const pole=new T.Vector3(-.5,-1,.05).applyQuaternion(orientation);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const elbowTarget=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,height);
  this.aim(this.arm,this.forearm,elbowTarget);this.aim(this.forearm,this.hand,target);
  // Rocketbox hand +X follows the fingers; +Z is the thumb side. Put +Z up,
  // with the knuckles facing the camera. These are actual skinned hand bones.
  const basis=new T.Matrix4().makeBasis(new T.Vector3(0,0,1),new T.Vector3(1,0,0),new T.Vector3(0,1,0));
  const handWorld=orientation.clone().multiply(new T.Quaternion().setFromRotationMatrix(basis));
  this.group.updateMatrixWorld(true);this.hand.quaternion.copy(this.hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handWorld));
  for(let finger=1;finger<=4;finger++)for(const [index,suffix]of ['','1','2'].entries())this.get('Finger'+finger+suffix).quaternion.setFromAxisAngle(new T.Vector3(0,0,1),index===0?.92+finger*.08:index===1?1.55:1.25);
  this.get('Finger0').quaternion.setFromAxisAngle(new T.Vector3(0,1,0),-Math.PI/2);this.get('Finger01').quaternion.identity();this.get('Finger02').quaternion.identity();
  for(const [joint,base]of this.originals){const target=joint.quaternion.clone();joint.quaternion.copy(base).slerp(target,this.weight);}
  this.group.updateMatrixWorld(true);
 }
 frameCamera(camera,active,followCamera){
  if(!this.active||!this.weight||!followCamera?.enabled||active?.player!==this.context)return false;
  const T=this.T,anchor=new T.Vector3().copy(active.player.position);anchor.y+=1.47;
  const direction=new T.Vector3(camera.position.x-anchor.x,0,camera.position.z-anchor.z);if(direction.lengthSq()<.001)return false;direction.normalize().multiplyScalar(1.45);direction.y=.14;const wanted=direction.length();direction.normalize();
  const distance=followCamera.safeDistance(active,anchor,direction,wanted);if(!Number.isFinite(distance)||distance<.85)return false;
  const position=anchor.clone().addScaledVector(direction,distance),ordinary=camera.quaternion.clone();camera.position.lerp(position,this.weight);camera.lookAt(anchor.x,anchor.y,anchor.z);const portrait=camera.quaternion.clone();camera.quaternion.copy(ordinary).slerp(portrait,this.weight);camera.updateMatrixWorld(true);return true;
 }
 diagnostics(){return {available:this.available,active:this.active,time:this.time,weight:this.weight??0};}
 dispose(){this.cancel();this.bones.clear();}
}

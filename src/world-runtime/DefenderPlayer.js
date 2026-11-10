import {T} from './vendor/world-engine-contract.js';

const folder='./media/defender/';
export const DEFENDER_VIDEO=folder+'gameplay.mp4';
const challenge=folder+'challenge.mp4';
export function defenderVolume(distance){
 if(!Number.isFinite(distance)||distance>=18)return 0;
 return .86/(1+.11*Math.max(0,distance-1)**1.35)*Math.min(1,(18-distance)/4);
}

// The CRT and its original audio use one browser media clock. Depth testing is
// performed by the scene, including when the cabinet is seen through a portal.
export class DefenderPlayer {
 constructor(cabinet,{makeVideo=()=>document.createElement('video'),makeTexture=v=>new T.VideoTexture(v),loadPoster=path=>new T.TextureLoader().load(path)}={}){
  Object.assign(this,{cabinet,makeVideo,makeTexture,loadPoster});
  this.phase='idle';this.hasPlayed=false;this.muted=false;this.distance=8;
  this.title=this.loadPoster(folder+'title.jpg');this.setPicture(this.title);
 }
 setPicture(texture){
  texture.colorSpace=T.SRGBColorSpace;
  const material=this.cabinet.screen.material;
  material.map=texture;material.color.set('#ffffff');material.needsUpdate=true;
 }
 get playing(){return this.phase==='game'||this.phase==='challenge';}
 start(){
  if(this.playing||this.phase==='disposed')return false;
  if(!this.video){
   const video=this.makeVideo();
   video.playsInline=true;video.preload='metadata';video.loop=false;
   this.video=video;this.texture=this.makeTexture(video);
   video.onended=()=>{
    if(this.phase==='game')this.playClip('challenge',challenge);
    else if(this.phase==='challenge')this.finish();
   };
   video.onerror=()=>this.interrupt();
  }
  this.hasPlayed=true;this.setPicture(this.texture);this.playClip('game',DEFENDER_VIDEO);return true;
 }
 playClip(phase,url){
  this.phase=phase;
  const v=this.video;v.src=url;v.muted=this.muted||phase==='challenge';v.volume=defenderVolume(this.distance);
  Promise.resolve(v.play()).catch(()=>{
   if(this.phase===phase&&v.paused){this.interrupt();this.hasPlayed=false;}
  });
 }
 playAtTable(){if(!this.hasPlayed)this.start();}
 cabinetAction(){
  if(!this.playing){this.muted=false;this.start();return;}
  if(this.phase==='game'){this.muted=!this.muted;this.video.muted=this.muted;}
 }
 update(position,{enabled=true}={}){
  if(!position||!enabled){this.interrupt();return;}
  const [x,y,z]=this.cabinet.speakerPosition;
  this.distance=Math.hypot(position.x-x,position.y-y,position.z-z);
  if(this.phase==='game')this.video.volume=defenderVolume(this.distance);
 }
 finish(){
  this.phase='finished';this.finalPoster??=this.loadPoster(folder+'challenge.jpg');this.setPicture(this.finalPoster);
  if(this.video){this.video.pause();this.video.muted=true;}
 }
 interrupt(){if(this.playing){this.phase='idle';this.video.pause();this.video.muted=true;this.setPicture(this.title);}}
 pause(){this.interrupt();}
 diagnostics(){return {kind:'recorded gameplay',phase:this.phase,playing:!!this.video&&!this.video.paused,muted:this.video?.muted??true,time:this.video?.currentTime??0,volume:this.video?.volume??0,source:this.video?.getAttribute('src')??null};}
 dispose(){
  if(this.phase==='disposed')return;this.phase='disposed';
  if(this.video){this.video.onended=null;this.video.onerror=null;this.video.pause();this.video.removeAttribute('src');this.video.load();this.video=null;}
  this.cabinet.screen.material.map=null;this.texture?.dispose();this.title.dispose();this.finalPoster?.dispose();
 }
}

import { C64Computer } from '../world/C64Computer.js';
import { SunComputer } from '../world/SunComputer.js';
import { PeriodComputer } from './PeriodComputer.js';
import { makeRetroScreenMaterial } from '../world/PortalRetroScreens.js';
import { buildRecipe } from '../world/PortalInteriorRecipe.js';
let screens;
export function repositoryRetroScreen(kind){
 screens??=new Map(buildRecipe().screens.map(s=>[s.id,s]));
 return makeRetroScreenMaterial(screens.get(kind));
}
// Reuse the installed game's actual C64 login and BASIC interpreter. Runtime state stays out of world Git.
export class RepositoryRetro{
 constructor(input,{canResume=()=>true,canCommand=()=>true,canExecute=()=>true,canUsePeriodGuest=()=>true}={}){this.canResume=canResume;this.canCommand=canCommand;this.canExecute=canExecute;this.canUsePeriodGuest=canUsePeriodGuest;this.input=input;this.computers=new Map();this.activeWorld=null;}
 get active(){return [...this.computers.values()].some(c=>c.active);}
 setWorld(active){if(active===this.activeWorld)return;this.clear();this.activeWorld=active;}
 nearest(cameraPosition){let found=null,best=Infinity;for(const t of this.activeWorld?.project.terminals??[]){const d=Math.hypot(...t.position.map((v,i)=>v-cameraPosition.getComponent(i)));if(d<t.interactionRadius&&d<best){found=t;best=d;}}return found;}
 open(terminal){if(!['c64','bbc','sun'].includes(terminal.kind))return false;const period=this.canUsePeriodGuest()===true;if(!period&&terminal.kind==='bbc')return false;const key=terminal.id+':'+(period?'period':'mediated');let computer=this.computers.get(key);if(!computer){const world=this.activeWorld,Computer=period?PeriodComputer:terminal.kind==='sun'?SunComputer:C64Computer;computer=new Computer({input:this.input,canResume:this.canResume,canCommand:this.canCommand,canExecute:this.canExecute,canUsePeriodGuest:this.canUsePeriodGuest,onScreen:canvas=>{if(this.activeWorld!==world)return;world?.root?.traverse(mesh=>{if(mesh.userData?.editorObjectIds?.includes(terminal.screenObjectId))mesh.userData.updateSunScreen?.(canvas);});}},terminal.kind);this.computers.set(key,computer);}void computer.open();return true;}
 clear({resume=false}={}){for(const computer of this.computers.values()){if(computer.active)computer.close({resume});if(computer.dispose)computer.dispose();else computer.dialog.remove();}this.computers.clear();this.activeWorld=null;}
 dispose(){this.clear();}
}

import {T} from './vendor/world-engine-contract.js';
import {Vector3} from '../engine/index.js';
import {WAREHOUSE_SURFACE_WORLD,WAREHOUSE_RECIPE_SOURCE} from './WarehouseSurfaces.js';

export const DEFENDER_POSITION=Object.freeze([-11.7,3,-90.7]);
export const DEFENDER_SIZE=Object.freeze([.76,1.86,.94]);
const screenWidth=.54,screenHeight=.405;
/** Installed presentation only. Authored project, signatures and portal policy are untouched. */
export function defenderCabinetEligible(candidate){
 const project=candidate?.project??candidate?.descriptor?.project;
 const id=candidate?.identity?.worldId??candidate?.descriptor?.worldId;
 const floor=project?.objects?.find(o=>o.id==='warehouse:object:0000');
 return id===WAREHOUSE_SURFACE_WORLD&&!!project.assets?.some(a=>a.source===WAREHOUSE_RECIPE_SOURCE)&&
  floor?.name==='polished tiled warehouse floor'&&floor.position?.every((n,i)=>Math.abs(n-[0,2.85,-77][i])<.001);
}
function labelTexture(draw,createCanvas,width=1024,height=256){
 const canvas=createCanvas();canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');draw(ctx,width,height);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
}
export function buildDefenderCabinet({createCanvas=()=>document.createElement('canvas')}={}){
 const root=new T.Group();root.name='Williams Defender upright cabinet';root.position.fromArray(DEFENDER_POSITION);
 root.userData.defenderCabinet=true;
 const black=new T.MeshStandardMaterial({color:'#11100e',roughness:.64}),red=new T.MeshStandardMaterial({color:'#c72b18',roughness:.44}),yellow=new T.MeshStandardMaterial({color:'#ffc624',roughness:.5}),metal=new T.MeshStandardMaterial({color:'#b2b6b4',metalness:.8,roughness:.32});
 const add=(name,geometry,material,position,rotation)=>{const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.fromArray(position);if(rotation)mesh.rotation.set(...rotation);root.add(mesh);return mesh;};
 const box=(name,size,p,m=black,r)=>add(name,new T.BoxGeometry(...size),m,p,r);
 // Williams-style deep upright silhouette: projecting controls, inset sloped CRT,
 // overhanging light box and tall flat back. All artwork below is hand drawn.
 const shape=new T.Shape();shape.moveTo(-.43,0);for(const [z,y]of [[.43,0],[.43,.89],[.49,1.02],[.23,1.12],[.05,1.58],[.39,1.65],[.39,1.86],[-.43,1.86]])shape.lineTo(z,y);shape.closePath();
 const sideGeometry=new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false});sideGeometry.rotateY(-Math.PI/2);
 for(const x of [-.345,.38])add('black sculpted cabinet side',sideGeometry.clone(),black,[x,0,0]);sideGeometry.dispose();
 box('cabinet lower body',[.69,.91,.83],[0,.455,0]);box('cabinet rear',[.69,1.83,.045],[0,.925,-.405]);
 box('Defender angled control panel',[.70,.075,.49],[0,1.015,.25],black,[-.13,0,0]);
 box('red control lip',[.70,.035,.025],[0,.99,.497],red);box('coin door',[.30,.34,.028],[0,.53,.435]);
 box('coin return slot',[.085,.025,.018],[.075,.57,.455],metal);box('coin entry',[.025,.08,.018],[-.075,.61,.455],metal);
 box('bottom kickplate',[.69,.12,.025],[0,.09,.435]);
 box('CRT dark surround',[.66,.53,.065],[0,1.373,.127],black,[-.28,0,0]);
 const screen=add('Defender CRT picture surface',new T.PlaneGeometry(screenWidth,screenHeight),new T.MeshBasicMaterial({color:'#080808',toneMapped:false}),[0,1.373,.169],[-.28,0,0]);
 screen.userData.corners=[[-screenWidth/2,screenHeight/2,0],[screenWidth/2,screenHeight/2,0],[screenWidth/2,-screenHeight/2,0],[-screenWidth/2,-screenHeight/2,0]];
 screen.userData.frontNormal=[0,0,1];screen.userData.width=screenWidth;screen.userData.height=screenHeight;
 const marquee=labelTexture((c,w,h)=>{c.fillStyle='#100e0d';c.fillRect(0,0,w,h);c.strokeStyle='#e13116';c.lineWidth=12;c.strokeRect(8,8,w-16,h-16);c.fillStyle='#ffc728';c.textAlign='center';c.font='italic 900 140px Arial';c.fillText('DEFENDER',w/2,h*.72,w*.94);},createCanvas);
 const marqueeMaterial=new T.MeshBasicMaterial({map:marquee,toneMapped:false});
 box('marquee light box',[.70,.22,.46],[0,1.745,.13]);add('DEFENDER yellow red marquee',new T.PlaneGeometry(.69,.205),marqueeMaterial,[0,1.745,.397]);
 for(const y of [1.625,1.862])box('red marquee trim',[.74,.018,.025],[0,y,.398],red);
 // Red/yellow side flashes and a simple original spacecraft graphic do not copy a scan.
 const art=labelTexture((c,w,h)=>{c.fillStyle='#12100f';c.fillRect(0,0,w,h);c.fillStyle='#cb2c19';c.beginPath();c.moveTo(0,h*.95);c.lineTo(w*.70,h*.30);c.lineTo(w*.85,h*.10);c.lineTo(w*.45,h*.20);c.lineTo(0,h*.70);c.fill();c.strokeStyle='#ffca29';c.lineWidth=22;c.beginPath();c.moveTo(w*.04,h*.84);c.lineTo(w*.61,h*.28);c.lineTo(w*.76,h*.18);c.stroke();c.fillStyle='#ffca29';c.save();c.translate(w*.53,h*.6);c.rotate(-.7);c.beginPath();c.moveTo(-w*.25,h*.035);c.lineTo(w*.25,0);c.lineTo(-w*.1,-h*.035);c.lineTo(-w*.06,0);c.closePath();c.fill();c.restore();},createCanvas,512,1024);
 for(const x of [-.382,.382])add('hand drawn red yellow side artwork',new T.PlaneGeometry(.70,1.5),new T.MeshBasicMaterial({map:art,side:T.DoubleSide}),[x,.88,-.015],[0,x<0?-Math.PI/2:Math.PI/2,0]);
 const legend=labelTexture((c,w,h)=>{c.fillStyle='#131211';c.fillRect(0,0,w,h);c.fillStyle='#ffca29';c.font='bold 33px Arial';c.textAlign='center';for(const [s,x,y]of [['MOVE',.12,.20],['REVERSE',.12,.78],['THRUST',.42,.72],['FIRE',.63,.72],['SMART BOMB',.82,.20],['HYPERSPACE',.82,.89]])c.fillText(s,w*x,h*y,w*.23);},createCanvas,1024,512);
 add('control panel legends',new T.PlaneGeometry(.68,.44),new T.MeshBasicMaterial({map:legend}),[0,1.061,.245],[-Math.PI/2-.13,0,0]);
 const cylinder=(name,r,h,p,m)=>add(name,new T.CylinderGeometry(r,r,h,16),m,p);
 cylinder('joystick steel stem',.009,.095,[-.25,1.14,.14],metal);add('red joystick ball',new T.SphereGeometry(.028,12,8),red,[-.25,1.195,.14]);
 for(const [name,x,z,m]of [['reverse',-.25,.38,red],['thrust',-.06,.34,yellow],['fire',.09,.34,red],['smart bomb',.25,.13,yellow],['hyperspace',.25,.42,red]]){cylinder(name+' black bezel',.026,.014,[x,1.079,z],black);cylinder(name+' button',.019,.018,[x,1.09,z],m);}
 for(const x of [-.26,.26]){cylinder('player start button',.014,.014,[x,1.075,.055],yellow);}
 for(let i=0;i<11;i++)box('speaker grille',[.004,.045,.009],[-.13+i*.026,1.603,.272]);
 let canvasTexture=null;
 return {root,screen,position:[...DEFENDER_POSITION],speakerPosition:[-11.7,4.28,-90.39],
  screenWorldCorners(){root.updateMatrixWorld(true);return screen.userData.corners.map(p=>new T.Vector3(...p).applyMatrix4(screen.matrixWorld).toArray());},
  bindCanvas(canvas){if(canvasTexture){canvasTexture.dispose();canvasTexture=null;}if(canvas){canvasTexture=new T.CanvasTexture(canvas);canvasTexture.colorSpace=T.SRGBColorSpace;canvasTexture.minFilter=T.LinearFilter;canvasTexture.magFilter=T.NearestFilter;canvasTexture.generateMipmaps=false;}screen.material.map=canvasTexture;screen.material.color.set(canvas?'#ffffff':'#080808');screen.material.needsUpdate=true;},
  update(){if(canvasTexture)canvasTexture.needsUpdate=true;},
  near(point){const p=new T.Vector3(point.x,point.y,point.z);root.worldToLocal(p);return p.z>.58&&p.z<2.2&&Math.abs(p.x)<1.05&&p.y>-.2&&p.y<2.5;},
  dispose(){root.removeFromParent();const gs=new Set(),ms=new Set(),ts=new Set();root.traverse(n=>{if(n.geometry)gs.add(n.geometry);if(n.material)ms.add(n.material);});for(const m of ms){if(m.map)ts.add(m.map);m.dispose();}for(const g of gs)g.dispose();for(const t of ts)t.dispose();}
 };
}
export function installDefenderCabinet(candidate,options){
 if(candidate?.defenderCabinet)return candidate.defenderCabinet;
 if(!defenderCabinetEligible(candidate))return null;
 const cabinet=buildDefenderCabinet(options);candidate.root.add(cabinet.root);
 const collider=candidate.colliders.addBox(new Vector3(-11.7,3.93,-90.67),new Vector3(.38,.93,.47),0,{solid:true,walkable:false,tag:'Williams Defender arcade cabinet'});
 const dispose=cabinet.dispose;cabinet.dispose=()=>{const boxes=candidate.colliders.boxes,index=boxes.indexOf(collider);if(index!==-1){boxes.splice(index,1);candidate.colliders.invalidateSpatialQueries();}dispose();if(candidate.defenderCabinet===cabinet)delete candidate.defenderCabinet;};
 candidate.defenderCabinet=cabinet;return cabinet;
}

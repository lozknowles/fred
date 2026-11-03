import {T} from './vendor/world-engine-contract.js';
import {isEligibleWebGLDepthOccluder} from './WebGLOpaqueDepthPrepass.js';

// A sphere must fit entirely inside ONE actual opaque triangle's shadow cone.
// No object/GLB bounding box is ever treated as solid (windows remain holes).
export function triangleOcclusionCone(a,b,c,eye,near=0.1){
 const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)),area=normal.length();
 if(!Number.isFinite(area)||area<1e-6)return null;
 normal.divideScalar(area);const distance=normal.dot(new T.Vector3().subVectors(eye,a));
 // Nearly edge-on and camera-adjacent geometry is deliberately left open.
 if(Math.abs(distance)<Math.max(near*4,0.25)||Math.abs(distance)/eye.distanceTo(a)<0.08)return null;
 if(distance<0)normal.negate();
 const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,a),edges=[];
 for(const [p,q,r] of [[a,b,c],[b,c,a],[c,a,b]]){
  const n=new T.Vector3().subVectors(p,eye).cross(new T.Vector3().subVectors(q,eye)).normalize();
  if(n.dot(new T.Vector3().subVectors(r,eye))<0)n.negate();
  edges.push(new T.Plane().setFromNormalAndCoplanarPoint(n,eye));
 }
 return {plane,edges,area};
}
export function sphereBehindTriangle(sphere,cone,margin=0.15){
 const radius=sphere.radius+margin;
 return Number.isFinite(radius)&&radius>0&&cone.plane.distanceToPoint(sphere.center)<-radius&&cone.edges.every(p=>p.distanceToPoint(sphere.center)>radius);
}

/** Only the main perspective view can discard instances. Alternate/portal views
 * restore every instance and use their own ordinary frustum selection. */
export function createNativePlantOcclusion(mainCamera){
 const side=16,bins=Array.from({length:side*side},()=>[]),vp=new T.Matrix4(),projected=new T.Vector3();
 let meshes=[],enabled=true,cones=[],triangles=[],tested=0,rejected=0,planeTests=0,revision=0,signature=null,geometrySignature=null,eligibleMeshes=0,reason='no-occluders';
 const eye=new T.Vector3(),instance=new T.Matrix4(),world=new T.Matrix4(),view=new T.Vector3();
 const clear=why=>{cones=[];signature=null;reason=why;for(const bin of bins)bin.length=0;};
 function rejectsXYZ(x,y,z,radius){
  if(!cones.length)return false;
  tested++;
  // A sphere contained by a triangle's cone necessarily has its CENTER inside
  // the projected triangle. A screen grid therefore only narrows candidates;
  // full four-plane sphere containment remains the sole rejection proof.
  const e=vp.elements,w=e[3]*x+e[7]*y+e[11]*z+e[15];
  if(w<=0)return false;
  const u=(e[0]*x+e[4]*y+e[8]*z+e[12])/w,v=(e[1]*x+e[5]*y+e[9]*z+e[13])/w;
  if(u<-1||u>1||v<-1||v>1)return false;
  const list=bins[Math.min(side-1,Math.floor((v+1)*.5*side))*side+Math.min(side-1,Math.floor((u+1)*.5*side))],r=radius+.15;
  if(!Number.isFinite(r)||r<=0)return false;
  for(const cone of list){
   const p=cone.planes;planeTests++;
   if(p[0]*x+p[1]*y+p[2]*z+p[3]>=-r)continue;
   let covered=true;
   for(let i=4;i<16;i+=4){planeTests++;if(p[i]*x+p[i+1]*y+p[i+2]*z+p[i+3]<=r){covered=false;break;}}
   if(covered){rejected++;return true;}
  }
  return false;
 }
 return {
  setOccluders(value){meshes=value??[];revision++;},
  setEnabled(value){if(enabled!==!!value){enabled=!!value;signature=null;}},
  get configured(){return enabled&&meshes.length>0;},get active(){return enabled&&cones.length>0;},get signature(){return signature;},
  resetCounters(){tested=rejected=planeTests=0;},
  prepare(camera,plantRoot=null){
   if(!enabled||!meshes.length){clear(!enabled?'disabled':'no-occluders');return;}
   if(camera!==mainCamera||!camera.isPerspectiveCamera||camera.isArrayCamera){clear('alternate-view');return;}
   if(Math.abs(camera.projectionMatrix.elements[2])+Math.abs(camera.projectionMatrix.elements[6])>1e-8){clear('oblique-projection');return;}
   const eligible=[],state=[revision];let renderRoot=plantRoot;while(renderRoot?.parent)renderRoot=renderRoot.parent;
   for(const mesh of meshes){
    if(!isEligibleWebGLDepthOccluder(mesh)||mesh.material.wireframe||!mesh.layers.test(camera.layers))continue;
    let visible=true,meshRoot=mesh;for(let p=mesh;p;p=p.parent){if(!p.visible)visible=false;meshRoot=p;}
    if(!visible||!mesh.parent||renderRoot&&meshRoot!==renderRoot)continue;
    mesh.updateWorldMatrix(true,false);eligible.push(mesh);
    const geometry=mesh.geometry,pos=geometry.getAttribute('position');
    state.push(mesh.uuid,geometry.uuid,pos.id,pos.version,geometry.index?.id,geometry.index?.version,mesh.instanceMatrix?.id,mesh.instanceMatrix?.version,mesh.count,mesh.material.side,geometry.drawRange.start,geometry.drawRange.count,...mesh.matrixWorld.elements);
   }
   eligibleMeshes=eligible.length;
   const geometryKey=state.join(',');
   if(geometrySignature!==geometryKey){
    geometrySignature=geometryKey;triangles=[];
    // World triangles are static until asset/instance/material state changes.
    // Camera motion never re-transforms or re-reads their original vertices.
    for(const mesh of eligible){
     const geometry=mesh.geometry,pos=geometry.getAttribute('position'),index=geometry.index;
     const start=geometry.drawRange.start,end=Math.min(index?.count??pos.count,start+geometry.drawRange.count);
     for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
      if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
      if(world.determinant()<=0)continue;
      for(let j=start;j+2<end;j+=3){
       const a=new T.Vector3().fromBufferAttribute(pos,index?index.getX(j):j).applyMatrix4(world),b=new T.Vector3().fromBufferAttribute(pos,index?index.getX(j+1):j+1).applyMatrix4(world),c=new T.Vector3().fromBufferAttribute(pos,index?index.getX(j+2):j+2).applyMatrix4(world);
       triangles.push({a,b,c,side:mesh.material.side,normal:new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a))});
      }
     }
    }
   }
   const key=[geometryKey,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,camera.near,camera.layers.mask].join(',');
   if(signature===key)return;signature=key;cones=[];for(const bin of bins)bin.length=0;
   camera.getWorldPosition(eye);vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
   for(const triangle of triangles){
    const {a,b,c,normal}=triangle;
    if([a,b,c].some(p=>view.copy(p).applyMatrix4(camera.matrixWorldInverse).z>=-Math.max(camera.near*4,.25)))continue;
    const facing=normal.dot(view.subVectors(eye,a));
    if(triangle.side===T.FrontSide&&facing<=0||triangle.side===T.BackSide&&facing>=0)continue;
    const cone=triangleOcclusionCone(a,b,c,eye,camera.near);if(!cone)continue;
    const planes=new Float64Array(16);for(const [i,p] of [cone.plane,...cone.edges].entries())planes.set([p.normal.x,p.normal.y,p.normal.z,p.constant],i*4);
    const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const p of [a,b,c]){projected.copy(p).applyMatrix4(vp);bounds.minX=Math.min(bounds.minX,projected.x);bounds.maxX=Math.max(bounds.maxX,projected.x);bounds.minY=Math.min(bounds.minY,projected.y);bounds.maxY=Math.max(bounds.maxY,projected.y);}
    if(bounds.maxX<-1||bounds.minX>1||bounds.maxY<-1||bounds.minY>1)continue;
    cones.push({planes,area:cone.area,bounds});
   }
   cones.sort((a,b)=>b.area-a.area);cones.length=Math.min(cones.length,128);
   const cell=x=>Math.max(0,Math.min(side-1,Math.floor((x+1)*.5*side)));
   for(const cone of cones){const b=cone.bounds;for(let y=cell(b.minY);y<=cell(b.maxY);y++)for(let x=cell(b.minX);x<=cell(b.maxX);x++)bins[y*side+x].push(cone);}
   reason=cones.length?'ready':eligibleMeshes?'no-covering-triangles':'no-eligible-materials';
  },
  rejects:sphere=>rejectsXYZ(sphere.center.x,sphere.center.y,sphere.center.z,sphere.radius),rejectsXYZ,
  stats:()=>({enabled,occluderMeshes:meshes.length,eligibleMeshes,sourceTriangles:triangles.length,proofTriangles:cones.length,tested,rejected,planeTests,screenBins:bins.length,reason,policy:'actual opaque triangle cone; 16x16 candidate grid; precomputed canopy bounds; main view only'})
 };
}

// PLANT_VERTEX canopy wind at nativeWindStrength=1 and unit nativeWind:
// |wind| <= hypot(.014*1.2+.0065*1.45,.0028) < .027.
// .04 covers float interpolation and shader trig error. The sphere encloses all
// source vertices, scaled sy, every wind phase, and every retained leaf card.
export function nativeCanopyOcclusionSphere(geometry,record,matrix,out=new T.Sphere()){
 if(!geometry.boundingSphere)geometry.computeBoundingSphere();
 out.copy(geometry.boundingSphere).applyMatrix4(matrix);
 if(!geometry.boundingBox)geometry.computeBoundingBox();
 const height=Math.max(0,geometry.boundingBox.max.y),scale=Math.abs(record.s);
 out.radius+=.04*height*height/12.5*scale+0.1;
 return out;
}

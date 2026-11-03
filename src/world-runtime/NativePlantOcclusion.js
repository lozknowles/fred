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
 let meshes=[],enabled=true,cones=[],tested=0,rejected=0,revision=0,signature=null;
 const eye=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),instance=new T.Matrix4(),world=new T.Matrix4(),view=new T.Vector3();
 return {
  setOccluders(value){meshes=value??[];revision++;},
  setEnabled(value){enabled=!!value;revision++;},
  get active(){return enabled&&meshes.length>0;},get revision(){return revision;},get signature(){return signature;},resetCounters(){tested=rejected=0;},
  prepare(camera,plantRoot=null){
   if(!enabled||camera!==mainCamera||!camera.isPerspectiveCamera||camera.isArrayCamera){cones=[];signature=null;return;}
   // Oblique projection is a portal/reflection view, even if it reuses the camera.
   if(Math.abs(camera.projectionMatrix.elements[2])+Math.abs(camera.projectionMatrix.elements[6])>1e-8){cones=[];signature=null;return;}
   const eligible=[],state=[revision,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,camera.near,camera.layers.mask];
   let renderRoot=plantRoot;while(renderRoot?.parent)renderRoot=renderRoot.parent;
   for(const mesh of meshes){
    if(!isEligibleWebGLDepthOccluder(mesh)||mesh.material.wireframe||!mesh.layers.test(camera.layers))continue;
    let visible=true,meshRoot=mesh;for(let p=mesh;p;p=p.parent){if(!p.visible)visible=false;meshRoot=p;}
    if(!visible||!mesh.parent||renderRoot&&meshRoot!==renderRoot)continue;
    mesh.updateWorldMatrix(true,false);eligible.push(mesh);
    state.push(mesh.uuid,mesh.geometry.uuid,mesh.geometry.getAttribute('position').id,mesh.geometry.getAttribute('position').version,mesh.geometry.index?.id,mesh.geometry.index?.version,mesh.instanceMatrix?.id,mesh.instanceMatrix?.version,mesh.count,mesh.material.side,mesh.geometry.drawRange.start,mesh.geometry.drawRange.count,...mesh.matrixWorld.elements);
   }
   const key=state.join(',');if(signature===key)return;signature=key;cones=[];
   camera.getWorldPosition(eye);
   for(const mesh of eligible){
    const geometry=mesh.geometry,pos=geometry.getAttribute('position'),index=geometry.index;
    const start=geometry.drawRange.start,end=Math.min(index?.count??pos.count,start+geometry.drawRange.count);
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
     if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);}else world.copy(mesh.matrixWorld);
     // Mirrored surfaces complicate front-face winding. Leave them open.
     if(world.determinant()<=0)continue;
     for(let j=start;j+2<end;j+=3){
      a.fromBufferAttribute(pos,index?index.getX(j):j).applyMatrix4(world);b.fromBufferAttribute(pos,index?index.getX(j+1):j+1).applyMatrix4(world);c.fromBufferAttribute(pos,index?index.getX(j+2):j+2).applyMatrix4(world);
      if([a,b,c].some(p=>view.copy(p).applyMatrix4(camera.matrixWorldInverse).z>=-Math.max(camera.near*4,0.25)))continue;
      const facing=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).dot(view.subVectors(eye,a));
      if(mesh.material.side===T.FrontSide&&facing<=0||mesh.material.side===T.BackSide&&facing>=0)continue;
      const cone=triangleOcclusionCone(a,b,c,eye,camera.near);if(cone)cones.push(cone);
     }
    }
   }
   // A bounded proof set prevents distant forest scans scaling with scene detail.
   // Omitting a small triangle can only retain extra plants.
   cones.sort((a,b)=>b.area-a.area);cones.length=Math.min(cones.length,128);
  },
  rejects(sphere){tested++;if(cones.some(cone=>sphereBehindTriangle(sphere,cone))){rejected++;return true;}return false;},
  stats:()=>({enabled,occluderMeshes:meshes.length,proofTriangles:cones.length,tested,rejected,policy:'actual opaque triangle cone; canopy deformation bounds; main view only'})
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

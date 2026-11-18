import {parseYouTubeSelection,youtubeWatchURL} from './YouTubeSelection.js';
import {SkinBounds} from '../engine/render/SkinBounds.js';
import {hasStaticWebGLMediaMaterial} from './WebGLWeatherShelter.js';
// Renderer-owned identity registration: mesh names/userData cannot grant exclusion.
const rendererMediaSkies=new WeakMap();
export function registerRendererMediaSky(owner,mesh,containsSightCone){
 if(!owner||owner.mesh!==mesh||typeof containsSightCone!=='function'||rendererMediaSkies.has(owner))throw Error('Invalid renderer sky proof registration');
 const proof={mesh,containsSightCone};rendererMediaSkies.set(owner,proof);
 return ()=>{if(rendererMediaSkies.get(owner)===proof)rendererMediaSkies.delete(owner);};
}
function rendererSkyExcluded(native,node,camera,projection,stats,reasons){
 const owner=native?.sky,proof=rendererMediaSkies.get(owner);if(!proof||proof.mesh!==node||owner.mesh!==node)return false;
 const e=node.matrixWorld?.elements,determinant=e&&e.length===16&&e.every(Number.isFinite)?e[0]*(e[5]*e[10]-e[9]*e[6])-e[4]*(e[1]*e[10]-e[9]*e[2])+e[8]*(e[1]*e[6]-e[5]*e[2]):NaN;
 if(!Number.isFinite(determinant)||determinant===0||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1){reasons.push('Renderer sky has an invalid or singular world transform');return false;}
 try{if(proof.containsSightCone(camera,projection.world)!==true)return false;}catch{return false;}
 stats.skyInteriorExclusions++;return true;
}

const ID=/^[A-Za-z0-9_-]{11}$/;
export function mediaLayout(config){
 if(!config||config.schema!=='elsemesh.media-screen/1'||config.provider!=='youtube'||typeof config.videoId!=='string'||!ID.test(config.videoId??'')||!Number.isFinite(config.width)||config.width<.5||config.width>12||Object.keys(config).some(k=>!['schema','provider','videoId','width'].includes(k)))throw Error('Invalid media screen configuration');
 const width=config.width,height=width*9/16;return {width,height,bezel:.09,depth:.2,frontZ:.119};
}
/** Installed geometry works with either the native engine API or the WebGL Three API. */
export function buildMediaScreenHousing(config,{api,material}){
 const s=mediaLayout(config),root=new api.Group(),parts=[['TV housing',s.width+.18,s.height+.18,.2,0,0,0,'#11151b'],['TV screen',s.width,s.height,.012,0,0,.112,'#05090d'],['TV wall mount',s.width*.26,s.height*.35,.12,0,0,-.15,'#252a30']];
 for(const [name,w,h,d,x,y,z,color]of parts){const mesh=new api.Mesh(new api.BoxGeometry(w,h,d),material({color,roughness:.45,metalness:.25}));mesh.name=name;mesh.position.set(x,y,z);root.add(mesh);}root.userData.mediaScreenHousing=true;return root;
}
const transform=(m,p)=>{const e=m.elements??m,[x,y,z]=p,w=e[3]*x+e[7]*y+e[11]*z+e[15];return [(e[0]*x+e[4]*y+e[8]*z+e[12])/w,(e[1]*x+e[5]*y+e[9]*z+e[13])/w,(e[2]*x+e[6]*y+e[10]*z+e[14])/w];};
function project(camera,p,v){
 const view=transform(camera.matrixWorldInverse,p),e=camera.projectionMatrix.elements??camera.projectionMatrix,[x,y,z]=view,w=e[3]*x+e[7]*y+e[11]*z+e[15];
 if(!Number.isFinite(w)||w<=0||-z<(camera.near??.1))return null;
 const px=(e[0]*x+e[4]*y+e[8]*z+e[12])/w,py=(e[1]*x+e[5]*y+e[9]*z+e[13])/w,pz=(e[2]*x+e[6]*y+e[10]*z+e[14])/w;
 if(![px,py,pz,-z].every(Number.isFinite)||pz>1||pz< -1)return null;return {x:v.left+(px+1)*v.width/2,y:v.top+(1-py)*v.height/2,depth:-z,w};
}
const polygonArea=points=>Math.abs(points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%points.length].y-p.y*points[(i+1)%points.length].x,0))/2;
function validViewport(v){return v&&[v.left,v.top,v.width,v.height].every(Number.isFinite)&&v.width>2&&v.height>2;}
/** Clip only the DOM exposure. Original world corners remain the occlusion proof.
 * Interpolate u/w,v/w,1/w in projected space, then divide: the inverse projective
 * mapping places the clip polygon in the iframe's untransformed coordinates.
 */
function clipScreenQuad(quad,viewport){
 if(!validViewport(viewport)||quad.length!==4||quad.some(p=>!p||![p.x,p.y,p.w].every(Number.isFinite)||p.w<=0))return null;
 const uv=[[0,0],[1,0],[1,1],[0,1]],planes=[['x',viewport.left+1,1],['x',viewport.left+viewport.width-1,-1],['y',viewport.top+1,1],['y',viewport.top+viewport.height-1,-1]];
 let points=quad.map((p,i)=>({x:p.x,y:p.y,u:uv[i][0]/p.w,v:uv[i][1]/p.w,q:1/p.w}));
 const partial=points.some(p=>planes.some(([axis,edge,sign])=>sign*(p[axis]-edge)<0));
 for(const [axis,edge,sign]of planes){
  const input=points;points=[];
  for(let i=0;i<input.length;i++){
   const a=input[i],b=input[(i+1)%input.length],insideA=sign*(a[axis]-edge)>=0,insideB=sign*(b[axis]-edge)>=0;
   if(insideA)points.push(a);
   if(insideA!==insideB){const t=(edge-a[axis])/(b[axis]-a[axis]),p={};for(const key of ['x','y','u','v','q'])p[key]=a[key]+t*(b[key]-a[key]);points.push(p);}
  }
  if(points.length<3)return null;
 }
 if(points.some(p=>!Object.values(p).every(Number.isFinite)||p.q<=0))return null;
 const area=polygonArea(points);if(!Number.isFinite(area)||area<=1e-7)return null;
 const polygon=points.map(p=>({x:p.x,y:p.y,u:p.u/p.q,v:p.v/p.q}));
 if(polygon.some(p=>!Object.values(p).every(Number.isFinite)||p.u< -1e-7||p.u>1+1e-7||p.v< -1e-7||p.v>1+1e-7))return null;
 const percent=n=>Math.min(1,Math.max(0,n))*100;
 return {area,polygon,partial,clipPath:partial?'polygon('+polygon.map(p=>percent(p.u)+'% '+percent(p.v)+'%').join(',')+')':null};
}
export function projectMediaScreen(camera,worldMatrix,config,viewport){
 if(!validViewport(viewport))return null;
 const s=mediaLayout(config);camera.updateMatrixWorld?.();if(camera.matrixWorldInverse?.copy&&camera.matrixWorld)camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
 const world=[[-s.width/2,s.height/2,s.frontZ],[s.width/2,s.height/2,s.frontZ],[s.width/2,-s.height/2,s.frontZ],[-s.width/2,-s.height/2,s.frontZ]].map(p=>transform(worldMatrix,p));
 const a=world[0],b=world[1],d=world[3],u=b.map((n,i)=>n-a[i]),v=d.map((n,i)=>n-a[i]),normal=[v[1]*u[2]-v[2]*u[1],v[2]*u[0]-v[0]*u[2],v[0]*u[1]-v[1]*u[0]],position=camera.position.toArray?.()??[camera.position.x,camera.position.y,camera.position.z];
 if(normal.reduce((n,c,i)=>n+c*(position[i]-a[i]),0)<=0)return null;
 const quad=world.map(p=>project(camera,p,viewport)),clipped=clipScreenQuad(quad,viewport);
 if(!clipped||clipped.area<64||!screenQuadTransform(quad))return null;
 return {quad,world,viewport,depth:Math.max(...quad.map(p=>p.depth)),clipPath:clipped.clipPath,viewportPartial:clipped.partial,visiblePolygon:clipped.polygon,visibleArea:clipped.area};
}
/** CSS homography maps the iframe rectangle to the real perspective-projected screen quad. */
export function screenQuadTransform(quad,width=1280,height=720){
 if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!p||![p.x,p.y].every(Number.isFinite))||![width,height].every(n=>Number.isFinite(n)&&n>0)||polygonArea(quad)<1e-7)return null;
 const [p0,p1,p2,p3]=quad,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1;
 let g=0,h=0;if(Math.abs(dx3)+Math.abs(dy3)>1e-7){if(Math.abs(den)<1e-9)return null;g=(dx3*dy2-dx2*dy3)/den;h=(dx1*dy3-dx3*dy1)/den;}
 const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
 const values=[a/width,d/width,0,g/width,b/height,e/height,0,h/height,0,0,1,0,p0.x,p0.y,0,1];
 return values.every(Number.isFinite)?'matrix3d('+values.join(',')+')':null;
}
const sightSubtract=(a,b)=>a.map((n,i)=>n-b[i]);
const sightCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sightDot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
// Private geometry proof, separate from diagnostic names/userData.
const orientedMediaBounds=new WeakMap();
/** Convex truncated sight volume versus complete finite world AABBs. Touching blocks. */
export function mediaScreenUnobstructed(projection,camera,bounds,{complete=false,onBlocked}={}){
 const deny=(reason,boundIndex)=>{onBlocked?.({reason,boundIndex});return false;};
 if(!complete||!projection||!Array.isArray(bounds))return deny('Incomplete visibility proof');
 const far=projection.world,near=camera?.near??.1;
 if(!Array.isArray(far)||far.length!==4||!far.every(finitePoint)||!Number.isFinite(near)||near<=0||!camera?.matrixWorld||!camera?.matrixWorldInverse)return deny('Invalid TV sight volume');
 const eye=transform(camera.matrixWorld,[0,0,0]);if(!finitePoint(eye))return deny('Invalid camera position');
 const vertices=far.map(p=>p.slice());
 for(const point of far){
  const depth=-transform(camera.matrixWorldInverse,point)[2];
  if(!Number.isFinite(depth)||depth<=near)return deny('TV intersects camera near plane');
  vertices.push(point.map((n,i)=>eye[i]+(n-eye[i])*near/depth));
 }
 if(!vertices.every(finitePoint))return deny('Invalid TV sight vertices');
 const boxAxes=[[1,0,0],[0,1,0],[0,0,1]],axes=[...boxAxes];
 const faces=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
 for(const face of faces){
  const normal=sightCross(sightSubtract(vertices[face[1]],vertices[face[0]]),sightSubtract(vertices[face[2]],vertices[face[0]])),length=Math.hypot(...normal);
  if(!Number.isFinite(length)||length<1e-12)return deny('Degenerate TV sight face');
  axes.push(normal.map(n=>n/length));
 }
 const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
 for(const [a,b]of edges)for(const boxAxis of boxAxes){
  const axis=sightCross(sightSubtract(vertices[b],vertices[a]),boxAxis),length=Math.hypot(...axis);
  if(!Number.isFinite(length))return deny('Invalid TV sight edge');
  if(length>1e-12)axes.push(axis.map(n=>n/length));
 }
 const intervals=axes.map(axis=>{const values=vertices.map(p=>sightDot(p,axis));return [Math.min(...values),Math.max(...values)];});
 if(!intervals.flat().every(Number.isFinite))return deny('Invalid TV sight interval');
 for(let index=0;index<bounds.length;index++){
  const bound=bounds[index];
  if(!finitePoint(bound?.min)||!finitePoint(bound?.max)||bound.min.some((n,i)=>n>bound.max[i]))return deny('Unknown or invalid occluder bounds',index);
  let separated=false;
  for(let k=0;k<axes.length;k++){
   const axis=axes[k],minimum=axis.reduce((sum,n,i)=>sum+n*(n>=0?bound.min[i]:bound.max[i]),0),maximum=axis.reduce((sum,n,i)=>sum+n*(n>=0?bound.max[i]:bound.min[i]),0),[lo,hi]=intervals[k];
   if(!Number.isFinite(minimum)||!Number.isFinite(maximum))return deny('Invalid occluder interval',index);
   // Require a real gap: tangency and numerical uncertainty remain blocked.
   if(maximum<lo-1e-7||minimum>hi+1e-7){separated=true;break;}
  }
  if(!separated){
   if(orientedMediaBounds.has(bound)){
    const volume=sightVolume(projection,camera),shadow=volume&&boxSightShadow(bound,volume);
    if(shadow&&shadow.length<3)continue;
   }
   return deny('Scene bound intersects the complete TV sight volume',index);
  }
 }
 return true;
}
// Double precision clipping and outward padding keep uncertain boundary pixels hidden.
const MEDIA_WORLD_PAD=1e-7,MEDIA_U_PAD=1/1280,MEDIA_V_PAD=1/720;
const MEDIA_MASK_LIMITS={bounds:4096,fragments:256,vertices:4096,work:120000,svg:180000};
function uvHull(points){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const half=input=>{const out=[];for(const p of input){while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}return out;};
 if(sorted.length<3)return [];
 return [...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)];
}
function uvClip(polygon,distance){
 const out=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
 }
 return out;
}
function sightVolume(projection,camera){
 if(!camera?.matrixWorld||!camera?.matrixWorldInverse)return null;
 const far=projection.world,eye=transform(camera.matrixWorld,[0,0,0]),near=camera.near??.1;
 if(!finitePoint(eye)||!Array.isArray(far)||far.length!==4||!far.every(finitePoint)||!Number.isFinite(near)||near<=0)return null;
 const vertices=far.map(p=>p.slice());
 for(const p of far){const depth=-transform(camera.matrixWorldInverse,p)[2];if(!Number.isFinite(depth)||depth<=near)return null;vertices.push(p.map((n,i)=>eye[i]+(n-eye[i])*near/depth));}
 const centre=[0,1,2].map(i=>vertices.reduce((sum,p)=>sum+p[i],0)/8),faces=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],planes=[];
 for(const ids of faces){const a=vertices[ids[0]],normal=sightCross(sightSubtract(vertices[ids[1]],a),sightSubtract(vertices[ids[2]],a)),length=Math.hypot(...normal);if(!Number.isFinite(length)||length<1e-12)return null;let n=normal.map(v=>v/length);if(sightDot(n,sightSubtract(centre,a))<0)n=n.map(v=>-v);planes.push({n,d:-sightDot(n,a)});}
 const a=far[0],u=sightSubtract(far[1],a),v=sightSubtract(far[3],a),normal=sightCross(u,v),uu=sightDot(u,u),uv=sightDot(u,v),vv=sightDot(v,v),det=uu*vv-uv*uv,eyeDistance=sightDot(normal,sightSubtract(a,eye));
 if(!Number.isFinite(det)||det<=1e-12||!Number.isFinite(eyeDistance)||Math.abs(eyeDistance)<1e-12)return null;
 if(far[2].some((n,i)=>Math.abs(n-a[i]-u[i]-v[i])>1e-7))return null;
 return {planes,eye,toUV:p=>{
  const ray=sightSubtract(p,eye),den=sightDot(normal,ray);if(!Number.isFinite(den)||Math.abs(den)<1e-12)return null;
  const t=eyeDistance/den;if(!Number.isFinite(t)||t<=0)return null;
  const delta=ray.map((n,i)=>eye[i]+n*t-a[i]),du=sightDot(delta,u),dv=sightDot(delta,v);
  return {x:(du*vv-dv*uv)/det,y:(dv*uu-du*uv)/det};
 }};
}
/** Clip a closed convex box, including each new cap face, against the complete
 * near/TV/side sight planes before projection. Unclipped box projection is unsafe
 * for boxes crossing the near plane or the actual, possibly oblique, TV plane. */
function boxSightShadow(bound,volume){
 const corners=orientedMediaBounds.get(bound)??[];if(!corners.length)for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)corners.push([x?bound.max[0]+MEDIA_WORLD_PAD:bound.min[0]-MEDIA_WORLD_PAD,y?bound.max[1]+MEDIA_WORLD_PAD:bound.min[1]-MEDIA_WORLD_PAD,z?bound.max[2]+MEDIA_WORLD_PAD:bound.min[2]-MEDIA_WORLD_PAD]);
 let faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]].map(ids=>ids.map(i=>corners[i]));
 for(const {n,d}of volume.planes){
  const next=[],cap=[];
  for(const face of faces){const out=[];for(let i=0;i<face.length;i++){
   const a=face[i],b=face[(i+1)%face.length],da=sightDot(n,a)+d+MEDIA_WORLD_PAD,db=sightDot(n,b)+d+MEDIA_WORLD_PAD;
   if(da>=0)out.push(a);
   if((da>=0)!==(db>=0)){const t=da/(da-db),p=a.map((v,k)=>v+(b[k]-v)*t);out.push(p);cap.push(p);}
  }if(out.length>=3)next.push(out);}
  if(cap.length>=3){
   const centre=[0,1,2].map(k=>cap.reduce((sum,p)=>sum+p[k],0)/cap.length),seed=Math.abs(n[0])<.8?[1,0,0]:[0,1,0],u=sightCross(n,seed),v=sightCross(n,u);
   cap.sort((a,b)=>{const da=sightSubtract(a,centre),db=sightSubtract(b,centre);return Math.atan2(sightDot(da,v),sightDot(da,u))-Math.atan2(sightDot(db,v),sightDot(db,u));});next.push(cap);
  }
  faces=next;if(!faces.length)return [];
 }
 const projected=faces.flat().map(volume.toUV);
 if(projected.some(p=>!p||![p.x,p.y].every(Number.isFinite)))return null;
 // A mask-pixel Minkowski margin covers floating error and SVG antialias fringes.
 return uvHull(projected.flatMap(p=>[-MEDIA_U_PAD,MEDIA_U_PAD].flatMap(x=>[-MEDIA_V_PAD,MEDIA_V_PAD].map(y=>({x:p.x+x,y:p.y+y})))));
}
// Preserve the old bounded proof on representation overflow. These cells may
// under-reveal a thin sliver, but every revealed cell is still wholly clear.
function mediaScreenGridFallback(projection,camera,bounds,columns,rows,hidden){
 const point=(u,v)=>{const [a,b,c,d]=projection.world;return a.map((n,i)=>n*(1-u)*(1-v)+b[i]*u*(1-v)+c[i]*u*v+d[i]*(1-u)*v);};
 const clear=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const u0=x/columns,u1=(x+1)/columns,v0=y/rows,v1=(y+1)/rows;
  const cell={world:[point(u0,v0),point(u1,v0),point(u1,v1),point(u0,v1)]};
  if(mediaScreenUnobstructed(cell,camera,bounds,{complete:true})&&clipScreenQuad(cell.world.map(p=>project(camera,p,projection.viewport)),projection.viewport))clear.push({x,y});
 }
 if(!clear.length)return hidden;
 const rectangles=clear.map(({x,y})=>'<rect x="'+(1280*x/columns)+'" y="'+(720*y/rows)+'" width="'+(1280/columns)+'" height="'+(720/rows)+'" fill="white"/>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'+rectangles+'</svg>';
 return {...hidden,visible:true,partial:true,mask:'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")',clearCells:clear.length,totalCells:columns*rows,visibleFraction:null,visiblePolygons:clear.length,maskFallback:'proven-clear-grid'};
}
/** Continuous silhouettes preserve slivers that contain no fully clear grid cell.
 * The upstream complete terrain/water/geometry proof is still mandatory. Convex
 * subtraction emits disjoint visible polygons: overlapping blockers cannot XOR
 * holes. Hard budgets fail closed, bounding both CPU work and generated SVG.
 */
export function mediaScreenCellVisibility(projection,camera,bounds,{complete=false,columns=6,rows=4}={}){
 const hidden={visible:false,partial:false,mask:null,clearCells:null,totalCells:null,visibleFraction:0,visiblePolygons:0};
 if(!complete||!projection||!validViewport(projection.viewport)||!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>48||!Array.isArray(bounds))return hidden;
 if(bounds.some(b=>!finitePoint(b?.min)||!finitePoint(b?.max)||b.min.some((n,i)=>n>b.max[i])))return hidden;
 if(mediaScreenUnobstructed(projection,camera,bounds,{complete:true}))return {...hidden,visible:true,clearCells:columns*rows,totalCells:columns*rows,visibleFraction:1,visiblePolygons:1};
 const fallback=()=>mediaScreenGridFallback(projection,camera,bounds,columns,rows,hidden);
 if(bounds.length>MEDIA_MASK_LIMITS.bounds)return fallback();
 const volume=sightVolume(projection,camera);if(!volume)return hidden;
 const viewport=projection.visiblePolygon?.map(p=>({x:p.u,y:p.v}));
 if(!viewport||viewport.length<3||viewport.some(p=>![p.x,p.y].every(Number.isFinite)))return hidden;
 const cone={min:[0,1,2].map(k=>Math.min(...projection.world.map(p=>p[k]),volume.eye[k])-MEDIA_WORLD_PAD),max:[0,1,2].map(k=>Math.max(...projection.world.map(p=>p[k]),volume.eye[k])+MEDIA_WORLD_PAD)};
 let clear=[viewport],work=0;
 for(const bound of bounds){
  if(!boxIntersects(bound,cone))continue;
  const shadow=boxSightShadow(bound,volume);if(shadow===null)return fallback();if(shadow.length<3)continue;
  const next=[];
  for(const polygon of clear){
   let inside=polygon;
   for(let i=0;i<shadow.length&&inside.length>=3;i++){
    work+=inside.length;if(work>MEDIA_MASK_LIMITS.work)return fallback();
    const a=shadow[i],b=shadow[(i+1)%shadow.length],distance=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    const outside=uvClip(inside,p=>-distance(p));if(outside.length>=3&&polygonArea(outside)>1e-14)next.push(outside);
    inside=uvClip(inside,distance);
   }
  }
  clear=next;if(!clear.length)return hidden;
  if(clear.length>MEDIA_MASK_LIMITS.fragments||clear.reduce((n,p)=>n+p.length,0)>MEDIA_MASK_LIMITS.vertices)return fallback();
 }
 const area=clear.reduce((sum,p)=>sum+polygonArea(p),0),viewportArea=polygonArea(viewport);
 if(!Number.isFinite(area)||area<=1e-14||!Number.isFinite(viewportArea)||viewportArea<=0)return hidden;
 const polygons=clear.map(p=>'<polygon points="'+p.map(({x,y})=>(x*1280)+','+(y*720)).join(' ')+'" fill="white"/>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'+polygons+'</svg>';
 if(svg.length>MEDIA_MASK_LIMITS.svg)return fallback();
 return {...hidden,visible:true,partial:true,mask:'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")',visibleFraction:Math.min(1,area/viewportArea),visiblePolygons:clear.length};
}
export function mediaScreenSurfaceExcluded(nativeIsland,projection,camera,{margin=.025}={}){
 const water=nativeIsland?.water;if(water?.surfaceExclusionsEnforced!==true||!projection?.world||!Number.isFinite(margin)||margin<0)return false;
 const volumes=water.getSurfaceExclusions?.()??water.surfaceExclusions;if(!Array.isArray(volumes)||volumes.length>16)return false;
 const ids=new Set();for(const v of volumes){if(!v||typeof v.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(v.id)||ids.has(v.id)||!Array.isArray(v.min)||!Array.isArray(v.max)||v.min.length!==3||v.max.length!==3||![...v.min,...v.max].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||v.min.some((n,i)=>n>=v.max[i]))return false;ids.add(v.id);}
 const points=[camera.position.toArray(),...projection.world];return volumes.some(v=>points.every(p=>p.every((n,i)=>n>v.min[i]+margin&&n<v.max[i]-margin)));
}
const geometryBoundsCache=new WeakMap(),nativePlantCache=new WeakMap(),instanceBoundsCache=new WeakMap();
function geometryBounds(geometry){
 const position=geometry?.attributes?.position??geometry?.getAttribute?.('position');if(!position?.count)return null;
 const cached=geometryBoundsCache.get(geometry),version=position.version??position.data?.version;
 if(cached?.position===position&&cached.version===version)return cached.bounds;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<position.count;i++)for(let k=0;k<3;k++){const n=position.getComponent?position.getComponent(i,k):position.array[i*position.itemSize+k];if(!Number.isFinite(n))return null;min[k]=Math.min(min[k],n);max[k]=Math.max(max[k],n);}
 const bounds={min,max,radius:Math.hypot(...min.map((n,i)=>Math.max(Math.abs(n),Math.abs(max[i]))))};geometryBoundsCache.set(geometry,{position,version,bounds});return bounds;
}
function transformedBounds(local,matrix,pad=0){
 const e=matrix.elements??matrix;
 if(e[3]===0&&e[7]===0&&e[11]===0&&e[15]===1){
  // Each output coordinate is affine. Its two extrema select the low or
  // high endpoint of each input axis independently, including negative scales.
  const min=[],max=[];
  for(let i=0;i<3;i++){
   const x0=e[i]*local.min[0],x1=e[i]*local.max[0],y0=e[i+4]*local.min[1],y1=e[i+4]*local.max[1],z0=e[i+8]*local.min[2],z1=e[i+8]*local.max[2];
   min[i]=Math.min(x0,x1)+Math.min(y0,y1)+Math.min(z0,z1)+e[i+12]-pad;
   max[i]=Math.max(x0,x1)+Math.max(y0,y1)+Math.max(z0,z1)+e[i+12]+pad;
  }
  return {min,max};
 }
 const points=[];for(const x of [local.min[0],local.max[0]])for(const y of [local.min[1],local.max[1]])for(const z of [local.min[2],local.max[2]])points.push(transform(matrix,[x,y,z]));
 return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))-pad),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))+pad)};
}
/** Keep the complete local box through affine transforms. A rotated thin rail's
 * world AABB can cover the camera near plane while the actual rail is clear.
 * This remains a closed conservative volume; near-plane cap faces are retained. */
function retainOrientedMediaBounds(bound,local,matrix){
 const e=matrix.elements??matrix;if(e.length!==16||!Array.from(e).every(Number.isFinite)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)return;
 const rows=[
  [e[5]*e[10]-e[9]*e[6],e[8]*e[6]-e[4]*e[10],e[4]*e[9]-e[8]*e[5]],
  [e[9]*e[2]-e[1]*e[10],e[0]*e[10]-e[8]*e[2],e[8]*e[1]-e[0]*e[9]],
  [e[1]*e[6]-e[5]*e[2],e[4]*e[2]-e[0]*e[6],e[0]*e[5]-e[4]*e[1]]];
 const det=e[0]*rows[0][0]+e[4]*rows[1][0]+e[8]*rows[2][0];if(!Number.isFinite(det)||Math.abs(det)<1e-12)return;
 // Inverse row norms map a world-space padding cube into local coordinates,
 // including nonuniform/negative scales and shear.
 const pad=rows.map(row=>MEDIA_WORLD_PAD*row.reduce((sum,n)=>sum+Math.abs(n/det),0));
 const corners=[];for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)corners.push(transform(e,[x?local.max[0]+pad[0]:local.min[0]-pad[0],y?local.max[1]+pad[1]:local.min[1]-pad[1],z?local.max[2]+pad[2]:local.min[2]-pad[2]]));
 if(corners.every(finitePoint))orientedMediaBounds.set(bound,corners);
}

function sameUpload(snapshot,source){
 for(let i=0;i<snapshot.length;i++)if(snapshot[i]!==source[i])return false;
 return true;
}
function packedFloatAttribute(attribute,size,count){
 return attribute?.array instanceof Float32Array&&attribute.itemSize===size&&!attribute.normalized&&
  !attribute.isInterleavedBufferAttribute&&attribute.array.length>=count*size;
}
/** Bound the installed non-canopy WebGL plant shader without adding height below its base. */
export function webGLPalmOcclusionBounds(local,matrix,{height,lean,windStrength,windLength}){
 if(!local||![height,lean,windStrength,windLength].every(Number.isFinite)||height<0||lean<0||windLength<0)return null;
 const w=Math.abs(windStrength),sway=Math.hypot(.0168*w*w+.009425*w,.0028*w)*windLength;
 const radius=local.radius??Math.hypot(...local.min.map((n,i)=>Math.max(Math.abs(n),Math.abs(local.max[i]))));
 if(!Number.isFinite(radius))return null;
 const horizontal=radius+height*(lean+sway);
 return transformedBounds({min:[-horizontal,-radius,-horizontal],max:[horizontal,height+radius,horizontal]},matrix);
}
/** Conservative per-triangle bounds for the installed non-canopy palm vertex shader. */
export function webGLPalmTriangleBounds(geometry,matrix,{height,lean,angle,windStrength,windLength}){
 const position=geometry?.attributes?.position,veg=geometry?.attributes?.aVeg,part=geometry?.attributes?.aMat,index=geometry?.index;
 if(!position?.count||!veg||!part||!index?.count||index.count>15000||![height,lean,angle,windStrength,windLength].every(Number.isFinite))return null;
 const w=Math.abs(windStrength),sway=Math.hypot(.0168*w*w+.009425*w,.0028*w)*windLength,leanX=Math.cos(angle)*lean,leanZ=Math.sin(angle)*lean;
 const boxes=[];
 for(let i=0;i<position.count;i++){
  const P=[0,1,2].map(k=>position.getComponent(i,k)),u=veg.getX(i),leaf=veg.getY(i),isStem=part.getX(i)<.5;
  if(!P.every(Number.isFinite)||!Number.isFinite(u)||!Number.isFinite(leaf))return null;
  let local;
  if(isStem){
   const fc0=u,fc1=u*(2-u),lo=Math.min(fc0,fc1),hi=Math.max(fc0,fc1),mid=(lo+hi)/2;
   const r=Math.hypot(P[0],P[2])+Math.abs(lean)*height*(hi-lo)/2+sway*u*u*height;
   local={min:[leanX*mid*height-r,u*height-r,leanZ*mid*height-r],max:[leanX*mid*height+r,u*height+r,leanZ*mid*height+r]};
  }else{
   const magnitude=Math.hypot(...P),tilt=magnitude*.5*Math.atan(Math.abs(lean)+2*sway);
   const bend=leaf*leaf*(.828*w*w+.43875*w),disp=Math.hypot(bend*windLength,.3*bend+.1*w*leaf*leaf);
   const pad=sway*height+tilt+2*disp+.02,centre=[P[0]+leanX*height,P[1]+height,P[2]+leanZ*height];
   local={min:centre.map(n=>n-pad),max:centre.map(n=>n+pad)};
  }
  boxes.push(transformedBounds(local,matrix));
 }
 const triangles=[];
 for(let k=0;k<index.count;k+=3){
  const vertices=[0,1,2].map(n=>boxes[index.getX(k+n)]);if(vertices.some(v=>!v))return null;
  triangles.push({min:[0,1,2].map(axis=>Math.min(...vertices.map(v=>v.min[axis]))),max:[0,1,2].map(axis=>Math.max(...vertices.map(v=>v.max[axis])))});
 }
 return triangles;
}
function boxIntersects(a,b){return [0,1,2].every(k=>a.min[k]<=b.max[k]&&a.max[k]>=b.min[k]);}
function multiply(a,b){const ae=a.elements??a,be=b.elements??b,out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=ae[k*4+r]*be[c*4+k];return out;}
/** Fine cell extrema bound every bilinear terrain height over the complete camera/screen cone. */
export function nativeMediaGroundProof(active,projection,camera){
 const data=active.nativeIsland?.data;if(!data?.isNativeIsland)return {clear:true};const all=[camera.position.toArray(),...projection.world],{min,max,i0,i1,j0,j1}=mediaSightCellRange(all,data);
 if(min[0]<data.origin||min[2]<data.origin||max[0]>=data.origin+data.size||max[2]>=data.origin+data.size)return {clear:false,reason:'TV sight cone is outside captured terrain'};
 let highest=-Infinity,cells=0;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=data.origin+(i+.5)*data.texel,z=data.origin+(j+.5)*data.texel;if(!data.cache?.readyAt(x,z))return {clear:false,reason:'Fine terrain visibility cells unavailable'};const h=data.heights[j*data.res+i];if(!Number.isFinite(h))return {clear:false,reason:'Invalid terrain visibility height'};highest=Math.max(highest,h);cells++;}
 if(highest+.15>=min[1])return {clear:false,reason:'Terrain may intersect the complete TV sight cone',highest,cells};
 const grass=active.nativeIsland.vegetation?.grass,mask=active.nativeIsland.mediaOcclusion?.grassMask;if(grass&&mask?.data&&Number.isInteger(mask.res)){
  const radius=Math.max(...grass.meshes.map(m=>geometryBounds(m.geometry)?.radius??Infinity))*3+1;if(!Number.isFinite(radius))return {clear:false,reason:'Native grass geometry envelope unavailable'};
  const x0=Math.max(0,Math.floor((min[0]-radius-data.origin)/data.size*mask.res)-1),x1=Math.min(mask.res-1,Math.ceil((max[0]+radius-data.origin)/data.size*mask.res)+1),z0=Math.max(0,Math.floor((min[2]-radius-data.origin)/data.size*mask.res)-1),z1=Math.min(mask.res-1,Math.ceil((max[2]+radius-data.origin)/data.size*mask.res)+1);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)for(let k=0;k<4;k++)if(mask.data[(z*mask.res+x)*4+k]!==0)return {clear:false,reason:'Native grass density near the TV sight cone',highest,cells};
  return {clear:true,highest,cells,grassZeroMaskProof:true,grassEnvelope:radius};
 }
 if(grass){const side=grass.cellsPerSide,c0=Math.max(0,Math.floor((min[0]-data.origin-2)/8)),c1=Math.min(side-1,Math.floor((max[0]-data.origin+2)/8)),z0=Math.max(0,Math.floor((min[2]-data.origin-2)/8)),z1=Math.min(side-1,Math.floor((max[2]-data.origin+2)/8));for(let z=z0;z<=z1;z++)for(let x=c0;x<=c1;x++)if(grass.cellFlags[z*side+x])return {clear:false,reason:'Native grass may intersect TV sight cone',highest,cells};}
 return {clear:true,highest,cells};
}
function nativePlantIndex(type,wind){
 const inst=type.inst;let cached=nativePlantCache.get(inst);if(cached?.wind===wind)return cached;
 const geometries=type.near?.meshes?.map(m=>geometryBounds(m.geometry)).filter(Boolean)??[];if(!geometries.length)return null;
 const radius=Math.max(...geometries.map(b=>b.radius)),entries=[],grid=new Map(),cell=32,w=Math.max(wind*.1,.03),sway=.017*w*w+.013*w;
 for(let i=0;i<inst.count;i++){const scale=Math.abs(inst.iPos[i*4+3]),height=Math.abs(inst.iDat[i*4+2]),lean=Math.abs(inst.iDat[i*4+1]),r=radius*scale+height*(lean+sway)+.2,y=inst.py[i],entry={min:[inst.px[i]-r,y-r,inst.pz[i]-r],max:[inst.px[i]+r,y+height+r,inst.pz[i]+r]};entries.push(entry);
  const key=Math.floor(inst.px[i]/cell)+':'+Math.floor(inst.pz[i]/cell);let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(i);}
 const maxRadius=entries.reduce((n,b,i)=>Math.max(n,b.max[0]-inst.px[i]),0);cached={wind,entries,grid,cell,maxRadius};nativePlantCache.set(inst,cached);return cached;
}
/** Collects physical meshes including noncolliding props/avatars; forest records stay flat and indexed. */
export function collectMediaScreenOccluders(active,{camera,projection,screenObjectId,avatarRoots=[]}={}){
 const bounds=[],reasons=[],stats={meshes:0,instances:0,nativeCandidates:0,skyInteriorExclusions:0};if(!active?.root||!projection)return {bounds,complete:false,reasons:['No active screen projection'],stats};
 const conePoints=[camera.position.toArray(),...projection.world],cone={min:[0,1,2].map(i=>Math.min(...conePoints.map(p=>p[i]))-.25),max:[0,1,2].map(i=>Math.max(...conePoints.map(p=>p[i]))+.25)},native=active.nativeIsland;
 const ground=nativeMediaGroundProof(active,projection,camera);if(!ground.clear)reasons.push(ground.reason);
 const waterExcluded=mediaScreenSurfaceExcluded(native,projection,camera);
 if(native&&!waterExcluded)reasons.push('Native ocean needs a complete sight-cone exclusion proof');
 const vegetation=native?.vegetation;
 if(vegetation){for(const type of vegetation.types??[]){const index=nativePlantIndex(type,active.project?.environment.windSpeed??6);if(!index){reasons.push('Native plant bounds unavailable');continue;}const {cell,maxRadius}=index;
  for(let z=Math.floor((cone.min[2]-maxRadius)/cell);z<=Math.floor((cone.max[2]+maxRadius)/cell);z++)for(let x=Math.floor((cone.min[0]-maxRadius)/cell);x<=Math.floor((cone.max[0]+maxRadius)/cell);x++)for(const i of index.grid.get(x+':'+z)??[]){stats.nativeCandidates++;const entry=index.entries[i];if(boxIntersects(entry,cone))bounds.push(entry);}}
 }
 const visit=(node,own=false)=>{if(node.visible===false)return;own=own||node.userData?.editorObjectId===screenObjectId;if(own||node===vegetation?.group)return;
  if(node.geometry&&!rendererSkyExcluded(native,node,camera,projection,stats,reasons)){
   const key=node.material?.customProgramCacheKey?.()??'',isNativeGround=node===native?.terrain?.mesh||node.userData?.nativeBase||node.userData?.nativeTextures,isNativeWater=node===native?.water?.mesh||/native.*(?:sea|ocean)/i.test(key);
   if((isNativeGround&&native)||(isNativeWater&&native)){/* Proven by installed fine-cell/dry-volume adapters above. */}
   else if(node.geometry.attributes?.iCell){reasons.push('Unknown displaced grass mesh');}
   else{
    const attributes=node.geometry.attributes??{},materials=Array.isArray(node.material)?node.material:[node.material],nativeSkinned=!node.isSkinnedMesh&&(attributes.skinIndex||attributes.skinWeight||materials.some(m=>m?.bindings?.skinJoints));
    const local=nativeSkinned?null:geometryBounds(node.geometry);
    if(nativeSkinned){
     const posed=node.skinBounds,sphere=posed?.sphere;
     if(!(posed instanceof SkinBounds)||posed.valid!==true||!sphere||!Number.isFinite(sphere.radius)||sphere.radius<0||![sphere.center.x,sphere.center.y,sphere.center.z].every(Number.isFinite))reasons.push('Native skinned mesh lacks trusted finite posed bounds');
     else{const center=sphere.center.toArray(),radius=sphere.radius,b=transformedBounds({min:center.map(n=>n-radius),max:center.map(n=>n+radius)},node.matrixWorld);stats.meshes++;if(boxIntersects(b,cone))bounds.push(b);}
    }
    else if(!local)reasons.push('Rendered geometry bounds unavailable');
    else if(node.isSkinnedMesh){if(typeof node.computeBoundingBox!=='function')reasons.push('Animated mesh bounds unavailable');else{node.computeBoundingBox();const b=node.boundingBox;if(!b)reasons.push('Animated mesh bounds unavailable');else bounds.push(transformedBounds({min:b.min.toArray(),max:b.max.toArray()},node.matrixWorld));}}
    else if(node.isInstancedMesh||node.instanceMatrix){const count=node.count??0,matrices=node.instanceMatrix?.array;if(!matrices)reasons.push('Instance transforms unavailable');else{
     const plant=node.geometry.attributes?.iPlant,record=node.geometry.attributes?.iRecord,windMeta=node.material?.userData,windVector=windMeta?.nativeWindVector;
     // Both released palm material versions use the same vertex displacement. Version 2 changes the leaf surface.
     const provenPalm=node.userData?.mediaOcclusionPlant==='native-palm-v1'&&/^native-source-plants-webgl\/(?:1|2):palm(?:\||$)/.test(key);
     const {aVeg,aMat}=node.geometry.attributes,index=node.geometry.index,windSpeed=active.project?.environment.windSpeed??6;
     const rigid=!plant&&!Object.values(node.geometry.morphAttributes??{}).some(a=>a.length)&&!Array.isArray(node.material)&&hasStaticWebGLMediaMaterial(node.material);
     const stamp=[rigid,provenPalm,count,windSpeed,windMeta?.nativeWindStrength,windVector?.x,windVector?.y,aVeg?.version,aMat?.version,index?.version,...node.matrixWorld.elements].join(',');
     const uploads=[node.instanceMatrix.version,plant?.version,record?.version].join(',');
     let cached=instanceBoundsCache.get(node);
     const sameInputs=cached?.stamp===stamp&&cached.local===local&&cached.index===index&&cached.aVeg===aVeg&&cached.aMat===aMat&&cached.matrixAttribute===node.instanceMatrix&&cached.plant===plant&&cached.record===record;
     // The plant renderer repacks draw buffers for each camera. Returning to
     // the main view may upload the identical visible instances a second time.
     // Compare private copies of their active values before reusing the grid
     // and per-triangle palm bounds. Upload order is significant.
     const identicalUpload=sameInputs&&(cached.uploads===uploads||(cached.snapshot&&
      sameUpload(cached.snapshot.matrices,matrices)&&sameUpload(cached.snapshot.plants,plant.array)&&sameUpload(cached.snapshot.records,record.array)));
     if(!identicalUpload){const entries=[],grid=new Map(),cell=32,w=Math.max(windSpeed*.1,.03);let radius=0;
      for(let i=0;i<count;i++){
       const matrix=multiply(node.matrixWorld,matrices.subarray(i*16,i*16+16)),scale=Math.max(Math.hypot(...matrix.slice(0,3)),Math.hypot(...matrix.slice(4,7)),Math.hypot(...matrix.slice(8,11)));
       const palm=provenPalm&&record?.getZ(i)<=.5;
       const tight=palm?webGLPalmOcclusionBounds(local,matrix,{height:Math.abs(plant.getZ(i)),lean:Math.abs(plant.getY(i)),windStrength:windMeta?.nativeWindStrength,windLength:Math.hypot(windVector?.x??NaN,windVector?.y??NaN)}):null;
       const pad=plant?Math.abs(plant.getZ(i))*scale*(1+Math.abs(plant.getY(i))+.017*w*w+.013*w)+.2:0,b=tight??transformedBounds(local,matrix,pad);
       if(rigid)retainOrientedMediaBounds(b,local,matrix);
       const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2;radius=Math.max(radius,(b.max[0]-b.min[0])/2,(b.max[2]-b.min[2])/2);entries.push(b);
       const cellKey=Math.floor(x/cell)+':'+Math.floor(z/cell);let bucket=grid.get(cellKey);if(!bucket)grid.set(cellKey,bucket=[]);bucket.push(i);
      }
      let snapshot=null;
      if(packedFloatAttribute(node.instanceMatrix,16,count)&&packedFloatAttribute(plant,4,count)&&packedFloatAttribute(record,4,count)){
       snapshot={matrices:matrices.slice(0,count*16),plants:plant.array.slice(0,count*4),records:record.array.slice(0,count*4)};
      }
      cached={stamp,uploads,snapshot,local,index,aVeg,aMat,matrixAttribute:node.instanceMatrix,plant,record,entries,grid,cell,radius,details:new Map()};instanceBoundsCache.set(node,cached);
     }else cached.uploads=uploads;
     for(let z=Math.floor((cone.min[2]-cached.radius)/cached.cell);z<=Math.floor((cone.max[2]+cached.radius)/cached.cell);z++)for(let x=Math.floor((cone.min[0]-cached.radius)/cached.cell);x<=Math.floor((cone.max[0]+cached.radius)/cached.cell);x++)for(const i of cached.grid.get(x+':'+z)??[]){stats.instances++;const b=cached.entries[i];if(boxIntersects(b,cone)){
       const palm=provenPalm&&record?.getZ(i)<=.5;
       if(palm){
        let details=cached.details.get(i);
        if(!details){const matrix=multiply(node.matrixWorld,matrices.subarray(i*16,i*16+16));details=webGLPalmTriangleBounds(node.geometry,matrix,{height:Math.abs(plant.getZ(i)),lean:plant.getY(i),angle:plant.getX(i),windStrength:windMeta?.nativeWindStrength,windLength:Math.hypot(windVector?.x??NaN,windVector?.y??NaN)});if(details){details.forEach((piece,triangle)=>piece.source={kind:'palm-triangle',species:node.userData?.nativePlantSpecies,index:i,triangle});cached.details.set(i,details);}}
        if(details){for(const piece of details)if(boxIntersects(piece,cone))bounds.push(piece);continue;}
       }
       bounds.push(b);b.source??={kind:'instance',mesh:node.name||node.userData?.nativePlantSpecies||'unnamed',program:node.material?.customProgramCacheKey?.()??'',index:i,canopy:record?.getZ(i),height:plant?.getZ(i),lean:plant?.getY(i)};
      }}
    }}
    else{const b=transformedBounds(local,node.matrixWorld);stats.meshes++;if(boxIntersects(b,cone))bounds.push(b);}
   }
  }
  for(const child of node.children??[])visit(child,own);
 };
 active.root.updateMatrixWorld?.(true);visit(active.root);for(const root of avatarRoots){root.updateMatrixWorld?.(true);visit(root);}
 return {bounds,complete:reasons.length===0,reasons,stats,ground,waterExcluded};
}
export function youtubeEmbedURL(config,origin,start=0){
 mediaLayout(config);const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.origin!==origin)throw Error('Invalid player origin');
 const params=new URLSearchParams({enablejsapi:'1',origin,playsinline:'1',rel:'0',autoplay:'1',start:String(Math.max(0,Math.floor(start)))});
 return 'https://www.youtube-nocookie.com/embed/'+config.videoId+'?'+params;
}
const errors={2:'YouTube rejected this video ID.',5:'YouTube playback is unavailable in this browser.',100:'This YouTube video is unavailable or private.',101:'The video owner does not allow embedding.',150:'The video owner does not allow embedding.',153:'YouTube did not receive the required client identification.'};
/** Local playback only. An active-world lease and conservative visibility proof are injected by the runtime. */
function mediaSightCellRange(points,{origin,res,texel}){
 const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
 return {min,max,i0:Math.max(0,Math.floor((min[0]-origin)/texel)-2),i1:Math.min(res-1,Math.ceil((max[0]-origin)/texel)+2),j0:Math.max(0,Math.floor((min[2]-origin)/texel)-2),j1:Math.min(res-1,Math.ceil((max[2]-origin)/texel)+2)};
}
export function mediaSightTiles(projection,camera,cache,{maxTiles=16}={}){
 if(!cache?.tiles||!projection?.world||!camera?.position)return null;
 const points=[camera.position.toArray(),...projection.world];if(!points.every(finitePoint))return null;
 const origin=projection.terrainOrigin,res=projection.terrainResolution,texel=projection.terrainTexel;
 if(!Number.isFinite(origin)||!Number.isInteger(res)||res<1||!Number.isFinite(texel)||texel<=0)return null;
 const {i0,i1,j0,j1}=mediaSightCellRange(points,{origin,res,texel});
 const x0=origin+(i0+.5)*texel,x1=origin+(i1+.5)*texel,z0=origin+(j0+.5)*texel,z1=origin+(j1+.5)*texel;
 const tiles=cache.tiles.filter(t=>t.bounds[0]<=x1&&t.bounds[2]>x0&&t.bounds[1]<=z1&&t.bounds[3]>z0);
 return tiles.length&&tiles.length<=maxTiles?tiles:null;
}
/** The same verified fine terrain bytes used by the renderer remain resident for the TV sightline. */
export class MediaScreen {
 constructor({getContext,isAuthorized,isUnobstructed=()=>false,describeObstruction=()=>null,onEnter=()=>{},onExit=()=>{},document:doc=globalThis.document,window:win=globalThis.window}){
  Object.assign(this,{getContext,isAuthorized,isUnobstructed,describeObstruction,onEnter,onExit,doc,win});
  this.selections=new WeakMap();this.active=null;this.iframe=null;this.video=null;this.captureGeneration=0;this.capturePending=false;this.disposed=false;this.nativeBlurred=false;this.controlsOpen=false;this.screenVisible=false;this.screenPartial=false;this.sightToken=0;this.sightKey=null;this.sightRelease=null;this.sightPending=false;this.sightError=null;
  this.status={state:'closed',playerState:null,currentTime:null,advancedSeconds:0,error:null};
  this.message=e=>this.receive(e);win.addEventListener('message',this.message);
  this.visibility=()=>{if(!this.playbackContext()){if(this.active)this.exit();return;}if(doc.visibilityState==='hidden'){if(this.video)this.suspendSharedPresentation();else{this.destroyPlayer({cancelCapture:false});this.releaseSightTiles();this.status.state='hidden-stopped';}}else if(this.video)this.update();};
  doc.addEventListener('visibilitychange',this.visibility);
  this.blur=()=>{this.nativeBlurred=true;if(this.video)this.suspendSharedPresentation();};
  this.focus=()=>{this.nativeBlurred=false;if(this.video){if(!this.playbackContext())this.exit();else this.update();}};
  this.teardown=()=>this.exit();
  win.addEventListener('blur',this.blur);win.addEventListener('focus',this.focus);win.addEventListener('pagehide',this.teardown);win.addEventListener('unload',this.teardown);
 }
 get playerElement(){return this.video??this.iframe;}
 suspendSharedPresentation(){
  if(!this.video)return;this.video.pause();this.sharedPresentationPaused=true;this.video.muted=true;this.video.style.opacity='0';this.video.style.pointerEvents='none';this.screenVisible=false;this.screenPartial=false;this.releaseSightTiles();this.status.state='shared-tab-suspended';
 }
 openWebsite(){
  try{const value=this.websiteInput.value.trim();if(value.length>2048||/[\u0000-\u0020\u007f]/.test(value))throw Error();const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error();this.websiteInput.setAttribute('aria-invalid','false');this.win.open(url.href,'_blank','noopener,noreferrer');}
  catch{this.websiteInput?.setAttribute('aria-invalid','true');if(this.note)this.note.textContent='Enter a valid HTTPS website address without a username or password.';}
 }
 // Called synchronously by the button: browser permission always follows a user gesture.
 shareBrowserTab(){
  if(this.disposed||!this.playbackContext())return false;
  const devices=this.win.navigator?.mediaDevices;
  if(!devices?.getDisplayMedia){if(this.note)this.note.textContent='Browser tab sharing is unavailable in this browser.';return false;}
  const generation=++this.captureGeneration,owner=this.active;this.capturePending=true;
  if(!this.poll)this.poll=setInterval(()=>this.heartbeat(),500);
  let request;
  try{request=devices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,selfBrowserSurface:'exclude',monitorTypeSurfaces:'exclude',surfaceSwitching:'exclude',systemAudio:'exclude'});}
  catch{this.captureFailed(generation);return false;}
  return Promise.resolve(request).then(stream=>{
   const tracks=stream.getTracks(),videos=stream.getVideoTracks();
   const valid=tracks.length===1&&videos.length===1&&tracks[0]===videos[0]&&videos[0].readyState==='live'&&videos[0].getSettings().displaySurface==='browser';
   if(this.disposed||generation!==this.captureGeneration||this.active!==owner||!this.playbackContext()||!valid){for(const track of tracks)track.stop();if(generation===this.captureGeneration){this.captureFailed(generation,'Select a browser tab with video only.');if(!this.playbackContext())this.exit();}return false;}
   const video=this.doc.createElement('video');video.width=1280;video.height=720;video.autoplay=true;video.playsInline=true;video.muted=true;video.title='Live shared browser tab on physical TV';
   video.style.cssText='position:fixed;top:0;left:0;width:1280px;height:720px;border:0;transform-origin:0 0;z-index:25;background:#000;object-fit:contain;pointer-events:none;opacity:0';
   video.srcObject=stream;
   this.capturePending=false;this.destroyPlayer({cancelCapture:false});this.video=video;this.sharedPresentationPaused=true;
   const ended=()=>{if(this.video===video)this.exit();};this.captureEnded=ended;this.captureTrack=videos[0];videos[0].addEventListener('ended',ended);
   this.doc.body.append(video);this.status.state='shared-tab';this.status.error=null;
   if(this.note)this.note.textContent='Live shared browser tab. Interact in the source tab; later navigation stays visible until Stop TV or Stop sharing.';
   this.poll=setInterval(()=>this.heartbeat(),500);this.update();return true;
  }).catch(()=>{this.captureFailed(generation);return false;});
 }
 captureFailed(generation,message='Browser tab sharing was cancelled or unavailable. Existing playback is unchanged.'){
  if(generation!==this.captureGeneration)return;this.capturePending=false;if(!this.playerElement){clearInterval(this.poll);this.poll=null;}if(this.note)this.note.textContent=message;
 }
 releaseSightTiles(){
  ++this.sightToken;this.sightRelease?.();this.sightRelease=null;this.sightKey=null;this.sightPending=false;this.sightError=null;
 }
 ensureSightTiles(projection,active){
  const cache=active.nativeIsland?.data?.cache;
  if(!cache)return true;
  if(!projection){this.releaseSightTiles();return false;}
  const data=active.nativeIsland.data,tiles=mediaSightTiles({...projection,terrainTexel:data.texel,terrainOrigin:data.origin,terrainResolution:data.res},this.getContext().camera,cache);
  if(!tiles){this.releaseSightTiles();this.sightError='TV visibility area is outside the verified terrain tile limit.';return false;}
  const key=tiles.map(t=>t.id).sort().join('|');
  if(this.sightKey===key&&this.sightCache===cache)return !!this.sightRelease;
  this.releaseSightTiles();this.sightKey=key;this.sightCache=cache;this.sightPending=true;
  const token=this.sightToken;
  cache.retain(tiles).then(release=>{
   if(this.sightToken!==token||this.active?.active!==active){release();return;}
   this.sightRelease=release;this.sightPending=false;
  }).catch(error=>{if(this.sightToken!==token)return;this.sightPending=false;this.sightError='TV visibility resources unavailable: '+error.message;});
  return false;
 }
 enter(object,active){
  mediaLayout(object.mediaScreen);
  if(this.active?.object.id===object.id&&this.active.active===active){this.openControls();return true;}
  this.exit();
  const c=this.getContext();
  if(!c?.ready||c.active!==active||!this.isAuthorized(object.id,'media.play'))throw Error('Access restricted');
  let choices=this.selections.get(active);
  if(!choices||choices.key!==c.key){choices={key:c.key,objects:new Map()};this.selections.set(active,choices);}
  const selected=choices.objects.get(object.id)??{videoId:object.mediaScreen.videoId,start:0};
  this.active={object,active,key:c.key,selected};
  this.status={state:'awaiting-user-play',playerState:null,currentTime:null,advancedSeconds:0,error:null};
  this.openControls();
  return true;
 }
 openControls(){
  if(!this.active||this.controlsOpen)return;
  this.controlsOpen=true;
  this.controls=this.doc.createElement('div');
  this.controls.style.cssText='position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:10000;background:#14212bf5;color:white;padding:16px;border-radius:10px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;width:min(640px,calc(100vw - 24px));box-sizing:border-box;max-height:80dvh;overflow:auto;font:16px system-ui';
  this.controls.setAttribute('role','region');this.controls.setAttribute('aria-label','TV controls');
  // The runtime also suspends movement while controls are open.
  this.controls.onkeydown=event=>event.stopPropagation();this.controls.onkeyup=event=>event.stopPropagation();
  const label=this.doc.createElement('label');label.textContent='YouTube video link';label.style.cssText='display:flex;flex-direction:column;gap:6px;flex:1 1 100%;min-width:0';
  this.videoInput=this.doc.createElement('input');this.videoInput.type='text';this.videoInput.value=youtubeWatchURL(this.active.selected);this.inputBaseline=this.videoInput.value;
  this.videoInput.placeholder='https://www.youtube.com/watch?v=… or video ID';this.videoInput.maxLength=2048;
  this.videoInput.style.cssText='font:inherit;padding:10px;min-width:0;width:100%;box-sizing:border-box';label.append(this.videoInput);
  this.play=this.doc.createElement('button');this.play.textContent='Play on TV';this.play.onclick=()=>this.playSelection();
  this.videoInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();this.playSelection();}};
  this.note=this.doc.createElement('span');this.note.setAttribute('role','status');this.note.setAttribute('aria-live','polite');this.note.style.cssText='flex:1 1 100%;overflow-wrap:anywhere';
  this.note.textContent=this.status.error?(errors[this.status.error]??'YouTube playback failed.'):this.iframe?(this.status.state==='playing'?'Playing on TV. Return to the game to keep watching while you walk.':'TV player is starting. Use the player controls if needed.'):'Paste a video link or ID, then play. Link timestamps are supported. Playback uses YouTube.';
  this.watchLink=this.doc.createElement('a');this.watchLink.textContent='Open selected video on YouTube';this.watchLink.href=youtubeWatchURL(this.active.selected);this.watchLink.target='_blank';this.watchLink.rel='noopener noreferrer';this.watchLink.style.color='#a9d9ff';
  const searchLabel=this.doc.createElement('label');searchLabel.textContent='Search YouTube';searchLabel.style.cssText='display:flex;flex-direction:column;gap:6px;flex:1 1 260px;min-width:0';
  const search=this.doc.createElement('input');search.type='search';search.maxLength=200;search.style.cssText='font:inherit;padding:10px;min-width:0';searchLabel.append(search);
  const searchButton=this.doc.createElement('button');searchButton.textContent='Search YouTube (opens YouTube)';
  searchButton.onclick=()=>{const query=search.value.trim();if(query){const url=new URL('https://www.youtube.com/results');url.searchParams.set('search_query',query);this.win.open(url.href,'_blank','noopener,noreferrer');}};
  const back=this.doc.createElement('button');back.textContent='Return to game';back.onclick=()=>this.closeControls();
  const stop=this.doc.createElement('button');stop.textContent='Stop TV';stop.onclick=()=>this.exit();
  const websiteLabel=this.doc.createElement('label');websiteLabel.textContent='Website URL';websiteLabel.style.cssText=label.style.cssText;
  this.websiteInput=this.doc.createElement('input');this.websiteInput.type='url';this.websiteInput.maxLength=2048;this.websiteInput.placeholder='https://www.daliparis.com/en/';this.websiteInput.style.cssText=this.videoInput.style.cssText;websiteLabel.append(this.websiteInput);
  const openWebsite=this.doc.createElement('button');openWebsite.textContent='Open website (new tab)';openWebsite.onclick=()=>this.openWebsite();
  const share=this.doc.createElement('button');share.textContent='Share browser tab';share.onclick=()=>this.shareBrowserTab();
  const sharingHelp=this.doc.createElement('span');sharingHelp.textContent='Live shared browser tab: open the website, then select that tab in the browser picker. Interact in the source tab; later navigation stays shared until Stop. Video only.';sharingHelp.style.cssText='flex:1 1 100%';
  for(const button of [this.play,searchButton,openWebsite,share,back,stop])button.style.cssText='font:inherit;min-height:44px;padding:8px 12px;cursor:pointer';
  this.controls.append(label,this.play,this.note,this.watchLink,searchLabel,searchButton,websiteLabel,openWebsite,share,sharingHelp,back,stop);
  if(this.video)this.note.textContent='Live shared browser tab. Interact in the source tab; later navigation stays shared until Stop.';
  this.doc.body.append(this.controls);
  if(this.iframe)this.iframe.style.pointerEvents=this.screenVisible&&!this.screenPartial?'auto':'none';
  this.doc.exitPointerLock?.();
  this.onEnter();
  this.videoInput.focus?.({preventScroll:true});
 }
 closeControls(){
  if(!this.controlsOpen)return;
  this.controls?.remove();this.controls=null;this.videoInput=null;this.websiteInput=null;this.note=null;this.watchLink=null;this.play=null;this.controlsOpen=false;
  if(this.iframe)this.iframe.style.pointerEvents='none';
  this.onExit();
  if(!this.playerElement&&!this.capturePending){this.releaseSightTiles();this.active=null;this.status.state='closed';}
 }
 // This lease check is deliberately independent of projection, terrain leases,
 // and occlusion. Player events and the heartbeat must not compete with audio.
 playbackContext(){
  const c=this.getContext(),a=this.active;
  if(!a||!c?.ready||c.active!==a.active||c.key!==a.key||!this.isAuthorized(a.object.id,'media.play'))return null;
  const matrix=c.objectMatrix?.(a.object.id)??a.active.matrices?.get(a.object.id);
  if(!matrix)return null;
  return {c,matrix};
 }
 validatePlayback(){
  if(!this.playbackContext()){this.exit();return false;}
  if(this.doc.visibilityState==='hidden'){this.visibility();return false;}
  return true;
 }
 heartbeat(){
  if(!this.playerElement&&!this.capturePending)return;
  if(!this.playbackContext()){this.exit();return;}
  if(this.video&&(this.doc.visibilityState==='hidden'||this.nativeBlurred)){this.suspendSharedPresentation();return;}
  if(this.doc.visibilityState==='hidden'){this.visibility();return;}
  if(!this.playerElement)return;
  // A stopped render loop cannot keep an old positive visual proof on screen.
  // Hide only the picture; the existing player and its audio keep advancing.
  if(performance.now()-this.lastVisualAt>1000){
   this.screenVisible=false;this.screenPartial=false;
   this.playerElement.style.opacity='0';this.playerElement.style.pointerEvents='none';
  }
  this.send({event:'listening',id:'elsemesh-tv',channel:'elsemesh-tv'});
  this.send({event:'command',func:'addEventListener',args:['onStateChange']});
  this.send({event:'command',func:'addEventListener',args:['onError']});
 }
 current(){
  const lease=this.playbackContext();if(!lease)return null;
  const {c,matrix}=lease,a=this.active;
  const projection=projectMediaScreen(c.camera,matrix,a.object.mediaScreen,c.viewport);
  const ready=this.ensureSightTiles(projection,a.active);
  const result=projection&&ready?this.isUnobstructed(projection,c,a.object):false;
  const visibility=result===true?{visible:true,partial:false,mask:null}:result&&typeof result==='object'?result:{visible:false,partial:false,mask:null};
  return {c,projection,...visibility};
 }
 playSelection(){
  if(!this.validatePlayback())return false;
  let selected;try{selected=parseYouTubeSelection(this.videoInput.value);}catch(error){this.note.textContent=error.message;this.videoInput.setAttribute('aria-invalid','true');return false;}
  this.videoInput.setAttribute('aria-invalid','false');
  if(this.videoInput.value===this.inputBaseline)selected.hasStart=false;
  const started=this.startPlayback(selected);if(started)this.inputBaseline=this.videoInput.value;return started;
 }
 startPlayback(selection=null){
  if(!this.validatePlayback())return false;
  if(this.sightError)this.releaseSightTiles();
  const current=this.current();
  if(!current){this.exit();return false;}
  const previous=this.active.selected,chosen=selection??previous;
  const changed=chosen.videoId!==previous.videoId;
  const start=changed||selection?.hasStart?chosen.start:this.status.currentTime??chosen.start;
  this.destroyPlayer();
  this.active.selected={videoId:chosen.videoId,start:chosen.start};
  this.selections.get(this.active.active).objects.set(this.active.object.id,this.active.selected);
  if(changed||selection?.hasStart)this.status.currentTime=null;
  if(this.watchLink)this.watchLink.href=youtubeWatchURL(this.active.selected);
  const frame=this.doc.createElement('iframe');
  frame.title='YouTube video on physical TV';frame.width='1280';frame.height='720';
  frame.allow='autoplay; encrypted-media; picture-in-picture';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.style.cssText='position:fixed;top:0;left:0;width:1280px;height:720px;border:0;transform-origin:0 0;z-index:25;background:#000';
  frame.style.transform=current.projection?screenQuadTransform(current.projection.quad):'translate(-2000px,-2000px)';
  frame.style.opacity=current.visible?'1':'0';
  frame.style.maskImage=current.mask??'none';frame.style.webkitMaskImage=current.mask??'none';
  frame.style.clipPath=current.projection?.clipPath??'none';
  frame.style.pointerEvents=current.visible&&!current.partial&&this.controlsOpen?'auto':'none';
  frame.src=youtubeEmbedURL({...this.active.object.mediaScreen,videoId:chosen.videoId},this.win.location.origin,start);
  this.iframe=frame;this.doc.body.append(frame);this.screenVisible=current.visible;this.screenPartial=!!current.partial;
  this.status.state='player-requested';this.status.error=null;this.status.playerState=null;this.status.advancedSeconds=0;
  if(this.note)this.note.textContent=current.visible?'TV player is starting. Use the player controls if autoplay is blocked.':'TV player is starting behind an obstruction; the picture will reappear when visible.';
  this.poll=setInterval(()=>this.heartbeat(),500);
  this.update();
  return true;
 }
 send(value){this.iframe?.contentWindow?.postMessage(JSON.stringify(value),'https://www.youtube-nocookie.com');}
 receive(event){
  if(!this.iframe||event.source!==this.iframe.contentWindow||event.origin!=='https://www.youtube-nocookie.com')return;
  if(!this.validatePlayback())return;
  let data;try{if(typeof event.data==='string'&&event.data.length>100000)return;data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(!data||typeof data!=='object')return;
  if(data.event==='onError'){this.status.error=data.info;this.status.state='playback-error';if(this.note)this.note.textContent=errors[data.info]??'YouTube playback failed.';return;}
  if(data.event==='onReady'){this.status.state='ready';this.send({event:'command',func:'playVideo',args:[]});}
  const state=data.event==='onStateChange'?data.info:data.info?.playerState;
  if(Number.isInteger(state)){
   this.status.playerState=state;
   this.status.state=({'-1':'awaiting-player-gesture','0':'ended','1':'playing','2':'paused','3':'buffering','5':'cued'})[state]??'unknown-player-state';
   if(this.note)this.note.textContent=({'-1':'Use the TV play control to begin.','0':'Video ended.','1':'Playing on TV','2':'Paused on TV','3':'YouTube is buffering.','5':'Video is ready.'})[state]??'YouTube player state unavailable.';
  }
  const time=data.info?.currentTime;
  if(Number.isFinite(time)&&time>=0){if(this.status.currentTime!==null&&this.status.playerState===1&&time>this.status.currentTime)this.status.advancedSeconds+=time-this.status.currentTime;this.status.currentTime=time;}
 }
 update(){
  if(!this.active)return;
  if(!this.playbackContext()){this.exit();return;}
  if(this.video&&(this.doc.visibilityState==='hidden'||this.nativeBlurred)){this.suspendSharedPresentation();return;}
  if(this.doc.visibilityState==='hidden'){this.destroyPlayer({cancelCapture:false});this.releaseSightTiles();this.status.state='hidden-stopped';return;}
  const current=this.current();
  if(!current){this.exit();return;}
  const player=this.playerElement;if(!player)return;
  if(this.video){this.status.state='shared-tab';if(this.sharedPresentationPaused){this.sharedPresentationPaused=false;const playing=this.video.play();playing?.catch?.(()=>{if(this.video===player&&this.note)this.note.textContent='Use Share browser tab again if this browser cannot display the shared tab.';});}}
  this.lastVisualAt=performance.now();
  if(this.sightError){if(this.note)this.note.textContent=this.sightError+' Use the TV play control to retry.';if(this.play)this.play.textContent='Play on TV';}
  this.screenVisible=current.visible;this.screenPartial=!!current.partial;
  player.style.opacity=current.visible?'1':'0';
  player.style.maskImage=current.mask??'none';player.style.webkitMaskImage=current.mask??'none';
  player.style.clipPath=current.projection?.clipPath??'none';
  player.style.pointerEvents=!this.video&&current.visible&&!current.partial&&this.controlsOpen?'auto':'none';
  if(current.projection)player.style.transform=screenQuadTransform(current.projection.quad);
 }
 destroyPlayer({cancelCapture=true}={}){
  if(cancelCapture){++this.captureGeneration;this.capturePending=false;}
  if(cancelCapture||!this.capturePending){clearInterval(this.poll);this.poll=null;}this.screenVisible=false;this.screenPartial=false;
  if(this.video){const video=this.video;this.video=null;this.captureTrack?.removeEventListener('ended',this.captureEnded);this.captureTrack=null;this.captureEnded=null;video.pause();for(const track of video.srcObject?.getTracks()??[])track.stop();video.srcObject=null;video.remove();}
  if(this.iframe){this.send({event:'command',func:'pauseVideo',args:[]});this.iframe.src='about:blank';this.iframe.remove();this.iframe=null;}
 }
 exit(){
  this.destroyPlayer();
  this.releaseSightTiles();
  this.closeControls();
  this.active=null;this.status.state='closed';
 }
 diagnostics(){return {...this.status,activeObjectId:this.active?.object.id??null,selectedVideoId:this.active?.selected.videoId??null,iframePresent:!!this.iframe,sharedTabPresent:!!this.video,sharePending:this.capturePending,controlsOpen:this.controlsOpen,screenVisible:this.screenVisible,screenPartial:this.screenPartial,visibilityLoading:this.sightPending,visibilityError:this.sightError,playbackScope:'local active world only',occlusion:'proven clear TV silhouette shown; playback continues behind obstructions',audioHeard:false};}
 dispose(){this.disposed=true;this.exit();this.win.removeEventListener('message',this.message);this.doc.removeEventListener('visibilitychange',this.visibility);this.win.removeEventListener('blur',this.blur);this.win.removeEventListener('focus',this.focus);this.win.removeEventListener('pagehide',this.teardown);this.win.removeEventListener('unload',this.teardown);}
}

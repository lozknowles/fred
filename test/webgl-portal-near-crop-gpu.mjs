import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]??'../../../outputs/portal-near-optics');await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true}});
server.middlewares.use((req,res,next)=>{if(req.url==='/near-fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,">');}else next();});await server.listen();let browser;
try{
 browser=await chromium.launch({channel:process.env.PORTAL_BROWSER_CHANNEL??'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5198/near-fixture');
 const result=await page.evaluate(async()=>{
  const {T}=await import('/src/world-runtime/vendor/world-engine-contract.js'),{WebGLPortalViews}=await import('/src/world-runtime/WebGLPortalViews.js');
  const r=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setSize(512,512);r.setPixelRatio(1);r.toneMapping=T.NoToneMapping;r.outputColorSpace=T.LinearSRGBColorSpace;document.body.append(r.domElement);
  const gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),adapter=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown';if(!debug||/swiftshader|llvmpipe|software|microsoft basic render/i.test(adapter))throw Error('Hardware renderer required: '+adapter);
  const check=(v,m)=>{if(!v)throw Error(m);},read=()=>{const p=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const camera=new T.PerspectiveCamera(60,1,.15,100);camera.updateMatrixWorld();const main=new T.Scene();main.background=new T.Color('#111111');
  const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{phase:{value:0}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;uniform float phase;void main(){vec2 cell=floor(v*16.);float odd=mod(cell.x+cell.y+phase,2.);gl_FragColor=vec4(mix(vec3(.2,.8,.35),vec3(.9,.25,.65),odd),1.);}'});
  const geometry=new T.PlaneGeometry(8,8),referenceBoard=new T.Mesh(geometry,material);referenceBoard.position.z=-3;const reference=new T.Scene();reference.add(referenceBoard);
  const root=new T.Group(),board=new T.Mesh(geometry,material);board.matrixAutoUpdate=false;root.add(board);const candidate={root};
  const views=new WebGLPortalViews({renderer:r,mainCamera:camera}).setTransparentPlaceholders(),yaw=.7,sin=Math.sin(yaw),cos=Math.cos(yaw),focal=Math.tan(Math.PI/6),rows=[];
  let aperture;const render=r.render.bind(r);let portalDraws=0;r.render=(...args)=>{portalDraws++;return render(...args);};
  // Measure the empty source scene through the same renderer/color space.
  // A hex Color is decoded from sRGB, so its linear framebuffer value is not
  // the raw hex byte. Keep a pixel oracle rather than assuming either value.
  render(main,camera);const emptySource=read(),backgroundPixel=[...emptySource.slice(0,4)];
  // Every aperture crosses both the eye plane and z=-near. Translation then
  // sweeps broad visible area, a narrow left sliver, fully outside, and back.
  for(const [frame,offset]of [0,-.3,-.9,-1.16,-1.3,0,-.3].entries()){
   material.uniforms.phase.value=frame%2;render(reference,camera);const expected=read();
   const source={position:[offset,0,-.12],yaw,width:2,height:2},destination={position:[10,0,0],yaw:0};
   // Independent rigid-pose construction; deliberately does not call the
   // production portal mapping or crop helpers. The ideal board stays z=-3
   // in source coordinates, so a full uncropped render is the pixel oracle.
   const mapping=new T.Matrix4().makeTranslation(10,0,0).multiply(new T.Matrix4().makeRotationY(Math.PI)).multiply(new T.Matrix4().makeRotationY(-yaw)).multiply(new T.Matrix4().makeTranslation(-offset,0,.12));
   board.matrix.copy(mapping).multiply(new T.Matrix4().makeTranslation(0,0,-3));board.matrixWorldNeedsUpdate=true;
   const mesh=views.setDestination('near',{source,destination,candidate,ownsCandidate:false,authorizedView:true,state:'live'});if(!aperture){aperture=mesh;main.add(mesh);}portalDraws=0;views.render();render(main,camera);const actual=read(),entry=views.entries.get('near');
   let inside=0,outside=0,maxError=0,mismatches=0;
   const intersects=(x,y,margin)=>{
    // Pinhole ray direction (dx,dy,-1); parameter t is camera-space depth.
    const dx=((x+.5)/512*2-1)*focal,dy=((y+.5)/512*2-1)*focal,t=(sin*offset-cos*.12)/(sin*dx-cos),localX=cos*(dx*t-offset)-sin*(-t+.12);
    return t>=.15+margin&&t<=100&&Math.abs(localX)<=1-margin&&Math.abs(dy*t)<=1-margin;
   };
   for(let y=4;y<508;y+=8)for(let x=4;x<508;x+=8){
    const index=(y*512+x)*4;
    if(intersects(x,y,.025)){
     // Exclude checker boundaries independently using the reference's local
     // 5x5 neighbourhood; compare broad stable ROIs rather than centre pixels.
     let stable=true;for(const [dx,dy]of [[-2,0],[2,0],[0,-2],[0,2]])for(let c=0;c<3;c++)if(Math.abs(expected[index+c]-expected[index+(dy*512+dx)*4+c])>2)stable=false;
     if(!stable)continue;inside++;let difference=0;for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(actual[index+c]-expected[index+c]));maxError=Math.max(maxError,difference);if(difference>12)mismatches++;
    }else if(!intersects(x,y,-.025)){
     outside++;for(let c=0;c<3;c++)check(Math.abs(actual[index+c]-emptySource[index+c])<=2,'old image/black wedge outside aperture '+JSON.stringify({frame,offset,x,y,pixel:[...actual.slice(index,index+3)],expected:[...emptySource.slice(index,index+3)]}));
    }
   }
   if(offset===-1.3){check(portalDraws===0,'fully out aperture still drew destination');check(!entry.material.visible,'fully out public aperture retained cached material');check(inside===0&&outside>3000,'out-of-frame oracle was not empty');}
   else{check(portalDraws===1,'visible near-clipped aperture skipped');check(inside>50,'positive near ROI too small '+JSON.stringify({offset,inside}));check(mismatches===0,'near-crop landmark ROI mismatch '+JSON.stringify({offset,inside,mismatches,maxError}));check(entry.crop.toArray().every(Number.isFinite)&&entry.camera.projectionMatrix.elements.every(Number.isFinite),'non-finite crop/projection');}
   if(offset===-1.16)check(inside<300&&outside>3000,'sweep did not create a visible sliver');
   rows.push({frame,offset,inside,outside,maxError,mismatches,portalDraws,state:entry.aperture.userData.portalViewState,crop:entry.crop?.toArray(),target:[entry.target.width,entry.target.height]});
  }
  const image=r.domElement.toDataURL();views.dispose();material.dispose();geometry.dispose();r.dispose();return {fixture:'Production WebGLPortalViews eye/near-plane crossing sweep versus independent uncropped checkerboard ROIs',scope:'Synthetic local GPU pixels; no live or physical device acceptance',adapter,backgroundPixel,rows,image};
 });
 if(errors.length)throw Error(JSON.stringify(errors));await writeFile(resolve(output,'near-crop.png'),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;await writeFile(resolve(output,'report.json'),JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await server.close();}

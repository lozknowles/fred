import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]??'../../outputs/portal-crop-optics');await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true}});
server.middlewares.use((req,res,next)=>{if(req.url==='/crop-fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,">');}else next();});await server.listen();
let browser;
try{
 browser=await chromium.launch({channel:process.env.PORTAL_BROWSER_CHANNEL??'msedge',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:5197/crop-fixture');
 const result=await page.evaluate(async()=>{
  const {T}=await import('/src/world-runtime/vendor/world-engine-contract.js'),{WebGLPortalViews}=await import('/src/world-runtime/WebGLPortalViews.js');
  const r=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setPixelRatio(2);r.setSize(384,256);r.setViewport(16,8,352,240);r.toneMapping=T.NoToneMapping;r.outputColorSpace=T.LinearSRGBColorSpace;document.body.append(r.domElement);
  const gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),adapter=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown';if(/swiftshader|llvmpipe|software|microsoft basic render/i.test(adapter))throw Error('Hardware renderer required: '+adapter);
  const samples=[];const check=(value,message)=>{if(!value)throw Error(message);};
  const pixel=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
  for(const sign of [1,-1]){
   const pose=(position,yaw=0)=>({position,yaw,width:3,height:3}),main=new T.Scene();main.background=new T.Color('#111111');const camera=new T.PerspectiveCamera(60,352/240,.1,100);
   const views=new WebGLPortalViews({renderer:r,mainCamera:camera,maxViews:3,configureScene:s=>s.background=new T.Color('blue')}).setTransparentPlaceholders();
   const nested={...pose([10,0,3*sign],sign===1?Math.PI:0),width:1.8,height:1.8,id:'bc',enabled:true,destination:{worldId:'C',portalId:'cb'}},exit={...pose([20,0,0],sign===1?0:Math.PI),id:'cb',enabled:true,destination:{worldId:'B',portalId:'bc'}};
   const bRoot=new T.Group(),node=new T.Mesh(new T.PlaneGeometry(nested.width,nested.height),new T.MeshBasicMaterial({color:'red',side:T.DoubleSide}));node.position.fromArray(nested.position);node.rotation.y=nested.yaw;node.userData.portalAperture=true;node.userData.portalId='bc';bRoot.add(node);
   const cRoot=new T.Group(),marker=new T.Mesh(new T.PlaneGeometry(.6,.6),new T.MeshBasicMaterial({color:'lime',side:T.DoubleSide}));marker.position.set(20.3,.1,2*sign);cRoot.add(marker);
   const b={root:bRoot,identity:{worldId:'B'},project:{portals:[nested]}},c={root:cRoot,identity:{worldId:'C'},project:{portals:[exit]}};
   main.add(views.setDestination('ab',{source:pose([0,0,0],sign===1?0:Math.PI),destination:pose([10,0,0],sign===1?0:Math.PI),candidate:b,ownsCandidate:false,authorizedView:true,state:'live'}));
   let allowed=true;views.resolveNestedDestination=()=>allowed?{candidate:c}:null;
   for(const eyeX of [.45,-.45]){
    camera.position.set(eyeX,.2,4*sign);camera.lookAt(0,0,0);camera.updateMatrixWorld();views.render({width:1,height:1});r.render(main,camera);
    // Independent unfolding for these known rigid poses: A→B rotates pi,
    // B→C translates (+10,0,-3*sign). C's marker is therefore (-.3,.1,-5*sign) in A.
    const projected=new T.Vector3(-.3,.1,-5*sign).project(camera),x=Math.round(32+(projected.x+1)/2*704),y=Math.round(16+(projected.y+1)/2*480),live=pixel(x,y);
    check(live[1]>230&&live[0]<10&&live[2]<10,'off-axis third-world marker misplaced '+JSON.stringify({sign,eyeX,x,y,live}));
    // A neighbouring ray must see blue through both openings, not a stretched
    // marker or stale full-frame sample. Four screen pixels exceed the marker edge.
    const beside=pixel(x+28,y);check(beside[2]>230&&beside[1]<10,'marker size/UV leaked '+JSON.stringify({sign,eyeX,beside}));
    const allocation=views.entries.get('ab').target,nestedTarget=views.nestedTargets[0]?.target;check(nestedTarget,'second hop did not draw');
    allowed=false;views.render();r.render(main,camera);const restricted=pixel(x,y);check(restricted[2]>230&&restricted[1]<10,'revoked third scene leaked '+JSON.stringify(restricted));allowed=true;
    const viewport=r.getCurrentViewport(new T.Vector4());check(viewport.equals(new T.Vector4(32,16,704,480)),'physical viewport not restored');
    samples.push({sign,eyeX,expectedPixel:[x,y],live,beside,restricted,outer:[allocation.width,allocation.height],nested:[nestedTarget.width,nestedTarget.height]});
   }
   views.dispose();bRoot.clear();cRoot.clear();node.geometry.dispose();node.material.dispose();marker.geometry.dispose();marker.material.dispose();
  }
  const image=r.domElement.toDataURL();r.dispose();return {fixture:'Production cropped portal material, off-axis two-hop pixels, both entrance directions, DPR2 offset viewport, immediate revocation',scope:'Synthetic local GPU optics only; no deployment or stock-world acceptance',adapter,samples,image};
 });
 await writeFile(resolve(output,'portal-crop-optics.png'),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;await writeFile(resolve(output,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await server.close();}

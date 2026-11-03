import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GRAPHICS_DEFAULTS, GRAPHICS_PRESETS, validateGraphicsPreferences, GraphicsQualityModel} from '../src/world-runtime/GraphicsQuality.js';

function clock(model) {
 let now = 0;
 model.observe(now);
 return {
  get now() { return now; },
  tick(ms, options) { now += ms; model.observe(now, options); },
  run(duration, interval = 40) {
   const end = now + duration;
   while (now < end) this.tick(typeof interval === 'function' ? interval(model.snapshot()) : interval);
  }
 };
}

test('preferences accept only finite enumerated values and never coerce', () => {
 assert.deepEqual(validateGraphicsPreferences({}), GRAPHICS_DEFAULTS);
 assert.deepEqual(validateGraphicsPreferences(GRAPHICS_PRESETS.capture), GRAPHICS_PRESETS.capture);
 assert.deepEqual(validateGraphicsPreferences(GRAPHICS_PRESETS.performance), GRAPHICS_PRESETS.performance);
 assert.deepEqual(validateGraphicsPreferences({mode:'target30', minimumScale:.85}), {...GRAPHICS_DEFAULTS, mode:'target30', minimumScale:.85});
 for (const invalid of [null, [], 12, {mode:'auto'}, {maxOutputPixels:'1000000'}, {maxOutputPixels:Infinity}, {portalLongEdge:513}, {minimumScale:.69}, {unknown:true}, {maxOutputPixels:0}, Object.create({mode:'target30'})]) {
  assert.deepEqual(validateGraphicsPreferences(invalid), GRAPHICS_DEFAULTS);
 }
 const result = validateGraphicsPreferences({});
 result.portalLongEdge = 5;
 assert.equal(GRAPHICS_DEFAULTS.portalLongEdge, 512);
 assert.equal(GRAPHICS_PRESETS.capture.maxOutputPixels, 2100000);
});

test('actual elapsed slow frames are measured without simulation dt clamping', () => {
 const model = new GraphicsQualityModel(), c = clock(model);
 c.run(4000, 200);
 const snapshot = model.snapshot();
 assert.equal(snapshot.fps, 5);
 assert.equal(snapshot.p95Ms, 200);
 assert.equal(snapshot.p99Ms, 200);
 assert.equal(snapshot.effective.scale, 1);
 assert.equal(snapshot.revision, 0);
});

test('manual quality never adapts and all observations stay bounded', () => {
 const model = new GraphicsQualityModel(GRAPHICS_PRESETS.capture), c = clock(model);
 c.run(60000, 100);
 c.run(10000, 1);
 const s = model.snapshot();
 assert.equal(s.status, 'Manual quality');
 assert.equal(s.revision, 0);
 assert.deepEqual(s.effective, {maxOutputPixels:2100000, portalLongEdge:1024, scale:1, portalScale:1});
 assert.ok(s.bufferedSamples <= 300);
 assert.ok(s.samples <= 300);
 for (const value of [s.fps, s.p95Ms, s.p99Ms]) assert.ok(Number.isFinite(value) && value > 0);
});

test('hidden/loading/invalid intervals reset clocks and require a new warmup', () => {
 const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
 c.run(4000, 40);
 c.tick(100000, {visible:false});
 assert.equal(model.snapshot().fps, null);
 assert.equal(model.snapshot().bufferedSamples, 0);
 c.tick(100000, {eligible:false});
 c.tick(40);
 c.run(4000, 40);
 assert.equal(model.snapshot().revision, 0);
 assert.equal(model.snapshot().p99Ms, 40);
 for (const invalid of [NaN, Infinity, -1]) {
  model.observe(invalid);
  assert.equal(model.snapshot().fps, null);
  assert.equal(model.snapshot().bufferedSamples, 0);
 }
});

test('30 and32FPS capped pacing never triggers degradation', () => {
 for (const fps of [30,32]) {
  const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
  c.run(60000, 1000/fps);
  assert.equal(model.snapshot().revision, 0);
  assert.equal(model.snapshot().status, 'Target reached');
 }
});

test('warmup, sustained slowness and one-step probes prevent immediate changes', () => {
 const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
 c.run(4800, 50);
 assert.equal(model.snapshot().revision, 0);
 c.run(800, 50);
 const s = model.snapshot();
 assert.equal(s.effective.portalScale, .9);
 assert.equal(s.effective.scale, 1);
 assert.equal(s.adaptation.probe.kind, 'portal');
 assert.equal(s.revision, 1);
});

test('ineffective portal probe restores quality, then bounded output probe also restores', () => {
 const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
 c.run(30000, 40);
 const s = model.snapshot();
 assert.equal(s.effective.portalScale, 1);
 assert.equal(s.effective.scale, 1);
 assert.deepEqual(s.adaptation.blocked, {portal:true, output:true});
 assert.equal(s.status, '30 FPS target not met; resolution changes did not improve frame pacing');
 assert.deepEqual(s.adaptation.decisions.map(d=>[d.action,d.kind]), [['probe-started','portal'],['probe-checking-baseline','portal'],['probe-restored','portal'],['probe-started','output'],['probe-checking-baseline','output'],['probe-restored','output']]);
 const revision = s.revision;
 c.run(30000,40);
 assert.equal(model.snapshot().revision, revision);
});

test('interrupted probe restores its provisional scale instead of accepting it', () => {
 const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
 c.run(5600, 40);
 assert.equal(model.snapshot().effective.portalScale, .9);
 c.tick(40, {eligible:false});
 assert.equal(model.snapshot().effective.portalScale, 1);
 assert.equal(model.snapshot().adaptation.probe, null);
});

test('responsive steps respect floors/ceilings and disclose an unmet target', () => {
 const model = new GraphicsQualityModel({mode:'target30',minimumScale:.85,maxOutputPixels:1500000,portalLongEdge:768}), c = clock(model);
 const responsive = s => 1000/(10 + 40*(1-s.effective.portalScale) + 40*(1-s.effective.scale));
 c.run(70000, responsive);
 const s = model.snapshot();
 assert.equal(s.effective.scale, .85);
 assert.equal(s.effective.portalScale, .85);
 assert.equal(s.status, 'Target not met at minimum quality');
 assert.equal(s.effective.maxOutputPixels, Math.round(1500000*.85**2));
 assert.equal(s.effective.portalLongEdge, Math.round(768*.85));
 assert.ok(s.adaptation.decisions.length<=16);
 assert.ok(s.effective.maxOutputPixels<=s.settings.maxOutputPixels);
 assert.ok(s.effective.portalLongEdge<=s.settings.portalLongEdge);
});

test('recovery requires sustained headroom and returns only to configured ceilings', () => {
 const model = new GraphicsQualityModel({mode:'target30',minimumScale:.85,maxOutputPixels:500000,portalLongEdge:384}), c = clock(model);
 c.run(70000, s=>1000/(10+40*(1-s.effective.portalScale)+40*(1-s.effective.scale)));
 const reduced = model.snapshot().effective;
 c.run(6000,20);
 assert.deepEqual(model.snapshot().effective, reduced);
 c.run(45000,20);
 assert.deepEqual(model.snapshot().effective, {maxOutputPixels:500000,portalLongEdge:384,scale:1,portalScale:1});
});

test('configuration restores ceilings and clears old statistics and policy', () => {
 const model = new GraphicsQualityModel({mode:'target30'}), c = clock(model);
 c.run(5600,40);
 assert.equal(model.snapshot().effective.portalScale, .9);
 const previousRevision=model.snapshot().revision;
 model.configure(GRAPHICS_PRESETS.capture);
 const s=model.snapshot();
 assert.equal(s.effective.portalScale,1);
 assert.equal(s.effective.maxOutputPixels,2100000);
 assert.equal(s.fps,null);
 assert.equal(s.bufferedSamples,0);
 assert.equal(s.adaptation.probe,null);
 assert.ok(s.revision>previousRevision);
 assert.equal(s.status,'Manual quality');
});

test('portal256 skips ineffective no-op tiers and uses output probes directly', () => {
 const model=new GraphicsQualityModel({mode:'target30',portalLongEdge:256,minimumScale:.5}),c=clock(model);
 c.run(20000,40);
 const s=model.snapshot();
 assert.equal(s.effective.portalLongEdge,256);
 assert.equal(s.effective.portalScale,1);
 assert.ok(s.adaptation.decisions.every(d=>d.kind==='output'));
 assert.equal(s.status,'30 FPS target not met; resolution changes did not improve frame pacing');
});

test('intermediate portal ceiling stops at actual256 clamp, never probes below it', () => {
 const model=new GraphicsQualityModel({mode:'target30',portalLongEdge:384,minimumScale:.5}),c=clock(model);
 c.run(180000,s=>{
  assert.ok(s.effective.portalLongEdge>=256);
  // Distinct responsive tiers, including the final partial step to256.
  const tier=Math.ceil((1-s.effective.portalScale)*10-1e-6);
  return 1000/(10*1.2**tier);
 });
 const s=model.snapshot();
 assert.equal(s.effective.portalLongEdge,256);
 assert.equal(s.effective.portalScale,256/384);
 assert.equal(s.effective.scale,1);
 assert.equal(s.status,'30 FPS target not met; resolution changes did not improve frame pacing');
});

test('bounded buffer still permits recovery at extremely high callback rates', () => {
 const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
 c.run(15000,s=>1000/(10+40*(1-s.effective.portalScale)));
 assert.equal(model.snapshot().effective.portalScale,.9);
 assert.equal(model.snapshot().adaptation.probe,null);
 c.run(16000,1);
 assert.equal(model.snapshot().effective.portalScale,1);
 assert.ok(model.snapshot().bufferedSamples<=300);
});

test('candidate improvement is provisional until the original baseline is remeasured', () => {
 const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
 while(model.snapshot().adaptation.probe?.phase!=='confirmation'&&c.now<12000)c.tick(model.snapshot().effective.portalScale<1?40:50);
 let s=model.snapshot();
 assert.equal(s.adaptation.probe.phase,'confirmation');
 assert.equal(s.effective.portalScale,1);
 assert.equal(s.status,'Checking previous detail');
 assert.ok(s.adaptation.probe.candidateFps>=24.9);
 assert.equal(s.adaptation.decisions.some(d=>d.action==='probe-improved'),false);
 c.run(4300,50);
 s=model.snapshot();
 assert.equal(s.effective.portalScale,.9);
 assert.equal(s.adaptation.probe,null);
 const decision=s.adaptation.decisions.find(d=>d.action==='probe-improved');
 assert.ok(decision.candidateFps>=decision.baselineFps*1.08);
 assert.ok(decision.candidateFps>=decision.confirmationFps*1.08);
 assert.equal(decision.stable,true);
});

test('a six-percent gain is rejected and quality restored', () => {
 const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
 c.run(14500,s=>1000/(s.effective.portalScale<1?21.2:20));
 const s=model.snapshot(),decision=s.adaptation.decisions.find(d=>d.action==='probe-restored');
 assert.equal(s.effective.portalScale,1);
 assert.equal(decision.reason,'nonresponsive');
 assert.equal(s.adaptation.blocked.portal,true);
 assert.equal(s.status,'30 FPS target not met; resolution changes did not improve frame pacing');
});

test('workload variation between A and A2 blocks even a large apparent gain', () => {
 const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
 c.run(14500,s=>1000/(s.adaptation.probe?.phase==='candidate'?30:s.adaptation.probe?.phase==='confirmation'?20:15));
 const s=model.snapshot(),decision=s.adaptation.decisions.find(d=>d.action==='probe-restored');
 assert.equal(s.effective.portalScale,1);
 assert.equal(decision.reason,'unstable');
 assert.equal(decision.stable,false);
 assert.equal(s.status,'30 FPS target not met; scene workload varied');
});

test('hidden/loading interruption during confirmation keeps original quality', () => {
 for(const options of [{visible:false},{eligible:false}]){
  const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
  while(model.snapshot().adaptation.probe?.phase!=='confirmation'&&c.now<12000)c.tick(40);
  assert.equal(model.snapshot().adaptation.probe.phase,'confirmation');
  c.tick(40,options);
  assert.equal(model.snapshot().effective.portalScale,1);
  assert.equal(model.snapshot().adaptation.probe,null);
  assert.equal(model.snapshot().fps,null);
  assert.equal(model.snapshot().adaptation.decisions.some(d=>d.action==='probe-improved'),false);
 }
});

test('a few multi-second intervals cannot confirm a quality reduction', () => {
 const model=new GraphicsQualityModel({mode:'target30'}),c=clock(model);
 c.run(40000,s=>s.adaptation.probe?.phase==='candidate'?500:1000);
 const s=model.snapshot();
 assert.equal(s.effective.portalScale,1);
 assert.equal(s.effective.scale,1);
 assert.equal(s.adaptation.decisions.some(d=>d.action==='probe-improved'),false);
 assert.ok(s.adaptation.decisions.some(d=>d.reason==='unstable'));
});

// Opt-in native mode: legacy manual/target30 contracts above remain unchanged.
test('native preset is valid, opt-in, and begins at a conservative one-million-pixel budget', () => {
 assert.equal(GRAPHICS_DEFAULTS.mode, 'manual');
 assert.deepEqual(validateGraphicsPreferences(GRAPHICS_PRESETS.autoNative), GRAPHICS_PRESETS.autoNative);
 const model = new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative);
 model.setViewport(3840,2160,2);
 assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
 assert.equal(model.snapshot().adaptation.nativeCeilingPixels,3686400);
 const saved=JSON.parse(JSON.stringify({version:1,preferences:GRAPHICS_PRESETS.capture}));
 assert.deepEqual(validateGraphicsPreferences(saved.preferences),GRAPHICS_PRESETS.capture);
 assert.deepEqual(validateGraphicsPreferences(JSON.parse(JSON.stringify(GRAPHICS_PRESETS.autoNative))),GRAPHICS_PRESETS.autoNative);
});

test('native mode probes upward at 32 FPS only after sustained headroom, accepts within budget', () => {
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(2560,1440,1);
 c.run(10000,1000/32);
 assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
 c.run(2000,1000/32);
 assert.equal(model.snapshot().effective.maxOutputPixels,1102500);
 assert.ok(model.snapshot().adaptation.nativeTrial);
 c.run(7000,1000/32);
 assert.ok(model.snapshot().adaptation.decisions.some(d=>d.action==='native-trial-accepted'));
 assert.equal(model.snapshot().adaptation.nativeTrial,null);
});

test('native mode rolls back an unacceptable upshift and backs off retrying', () => {
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(2560,1440,1);
 c.run(12000,1000/32);
 assert.ok(model.snapshot().adaptation.nativeTrial);
 c.run(8000,40);
 assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
 assert.ok(model.snapshot().adaptation.decisions.some(d=>d.action==='native-trial-restored'));
 c.run(12000,1000/32);
 assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
 assert.equal(model.snapshot().adaptation.nativeTrial,null);
});

test('exact 30 FPS and recurring stalls never justify a native upshift', () => {
 for(const interval of [1000/30]){
  const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
  model.setViewport(2560,1440,1);
  c.run(50000,interval);
  assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
  assert.equal(model.snapshot().adaptation.decisions.some(d=>d.action==='native-trial-started'),false);
 }
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(2560,1440,1);
 for(let i=0;i<20;i++){c.run(1000,1000/32);c.tick(500);}
 assert.equal(model.snapshot().adaptation.decisions.some(d=>d.action==='native-trial-started'),false);
 assert.ok(model.snapshot().p99Ms>=500);
});

test('native slow frames reduce a bounded screen budget and disclose floor exhaustion', () => {
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(2560,1440,1);
 c.run(180000,50);
 const s=model.snapshot();
 assert.equal(s.effective.maxOutputPixels,250000);
 assert.equal(s.status,'30 FPS target not met at minimum quality');
 assert.equal(s.effective.portalLongEdge,512);
});

test('native viewport and DPR changes reset provisional work without an unmeasured quality jump', () => {
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(2560,1440,1);
 c.run(12000,1000/32);
 assert.ok(model.snapshot().adaptation.nativeTrial);
 model.setViewport(1920,1080,2);
 assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
 assert.equal(model.snapshot().adaptation.nativeTrial,null);
 assert.equal(model.snapshot().fps,null);
 model.setViewport(640,360,1);
 assert.equal(model.snapshot().effective.maxOutputPixels,640*360);
 model.setViewport(2560,1440,2);
 assert.equal(model.snapshot().effective.maxOutputPixels,640*360);
 c.run(1000,1000/32);
 assert.equal(model.snapshot().effective.maxOutputPixels,640*360);
});

test('native interrupted trials restore prior budget, and high headroom stops at actual native ceiling', () => {
 for(const options of [{visible:false},{eligible:false}]){
  const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
  model.setViewport(1280,720,2);
  c.run(12000,1000/32);
  c.tick(31.25,options);
  assert.equal(model.snapshot().effective.maxOutputPixels,1000000);
  assert.equal(model.snapshot().adaptation.nativeTrial,null);
 }
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(1280,720,1);
 c.run(60000,16);
 assert.equal(model.snapshot().effective.maxOutputPixels,921600);
 assert.equal(model.snapshot().effective.scale,1);
});

test('native high-headroom steps reach but never exceed the 1440p pixel ceiling', () => {
 const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
 model.setViewport(3840,2160,2);
 c.run(400000,20);
 assert.equal(model.snapshot().effective.maxOutputPixels,3686400);
 assert.equal(model.snapshot().effective.scale,1);
 assert.equal(model.snapshot().adaptation.nativeTrial,null);
 const before=model.snapshot();
 for(const viewport of [[0,0,1],[-1,300,1],[800,600,NaN],[800,600,0]])model.setViewport(...viewport);
 assert.deepEqual(model.snapshot(),before);
});

import {outputPixelRatio} from '../src/engine/OutputResolution.js';
import {Engine} from '../src/engine/Engine.js';

test('native sizing opts into device DPR while preserving both legacy backend limits', () => {
 const viewport={width:800,height:450,devicePixelRatio:3,maxOutputPixels:3686400};
 assert.equal(outputPixelRatio({...viewport,legacyLimit:1}),1);
 assert.equal(outputPixelRatio({...viewport,legacyLimit:1.5}),1.5);
 assert.equal(outputPixelRatio({...viewport,nativeResolution:true}),3);
 assert.equal(outputPixelRatio({...viewport,devicePixelRatio:1,nativeResolution:true}),1);
 for(const [width,height,dpr] of [[3840,2160,2],[1920,1080,2],[800,450,3],[2560,1440,1],[800,1200,2]]){
  const ratio=outputPixelRatio({width,height,devicePixelRatio:dpr,nativeResolution:true,maxOutputPixels:Infinity});
  assert.ok(ratio<=dpr);
  assert.ok(Math.floor(width*ratio)*Math.floor(height*ratio)<=3686400);
 }
});

test('real WebGPU resize path changes drawing buffer as measured native trials change budget', () => {
 const oldWindow=globalThis.window;
 globalThis.window={innerWidth:2560,innerHeight:1440,devicePixelRatio:1};
 try{
  const engine=new Engine({});
  engine.canvas={style:{}};engine.camera={updateProjectionMatrix(){}};engine.nativeResolution=true;
  const model=new GraphicsQualityModel(GRAPHICS_PRESETS.autoNative),c=clock(model);
  model.setViewport(2560,1440,1);
  const resize=()=>{engine.maxOutputPixels=model.snapshot().effective.maxOutputPixels;engine.resize();return [engine.width,engine.height];};
  assert.deepEqual(resize(),[1333,750]);
  c.run(12000,1000/32);
  assert.deepEqual(resize(),[1400,787]);
  c.run(8000,40);
  assert.deepEqual(resize(),[1333,750]);
  // A smaller device/window clamps immediately; increasing it waits for evidence.
  window.innerWidth=640;window.innerHeight=360;model.setViewport(640,360,1);
  assert.deepEqual(resize(),[640,360]);
  window.innerWidth=2560;window.innerHeight=1440;model.setViewport(2560,1440,1);
  assert.deepEqual(resize(),[640,360]);
  engine.nativeResolution=false;engine.maxOutputPixels=2073600;
  assert.deepEqual(resizeLegacy(engine),[1920,1080]);
 }finally{globalThis.window=oldWindow;}
 function resizeLegacy(engine){engine.maxOutputPixels=2073600;engine.resize();return [engine.width,engine.height];}
});

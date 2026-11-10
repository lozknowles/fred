import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=resolve(process.env.MICRO_EVIDENCE??'../../fred-period/micro');await mkdir(out,{recursive:true});
const server=await createServer({appType:'custom',server:{host:'127.0.0.1',port:0},logLevel:'error'});
server.middlewares.use('/micro-acceptance',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="margin:0;width:1100px;height:820px"></body>');});await server.listen();let browser;
const evidence={time:new Date().toISOString(),browser:'Microsoft Edge / Playwright real keyboard events',program:['10 PRINT "Hello Ed & Vicco"','20 FOR I=1 TO 3','30 PRINT I*I','40 NEXT I'],guests:[],errors:[]};
try {
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1120,height:850}});page.on('pageerror',e=>evidence.errors.push(e.message));
 for(const kind of (process.env.MICRO_KIND?[process.env.MICRO_KIND]:['c64','bbc'])){console.log('START',kind);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/micro-acceptance`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async kind=>{const {createMicroGuest}=await import('/src/world-runtime/MicroComputerGuest.js');window.guest=createMicroGuest({kind});document.body.append(guest.element);},kind);
  await page.waitForTimeout(kind==='bbc'?20000:8000);
  console.log('LOADED',kind);let frame=page.frames().find(f=>f.url().startsWith('https://'));assert(frame,'Provider frame missing');
  console.log('CLICK',kind);await page.locator('iframe').focus();const box=await frame.locator('canvas:visible').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  for(const line of [...evidence.program,'LIST','RUN']){console.log('TYPE',kind,line);for(const ch of (kind==='c64'?line.toLowerCase():line)){await page.keyboard.press(ch,{delay:65});await page.waitForTimeout(105);}await page.keyboard.press('Enter',{delay:65});await page.waitForTimeout(500);}
  await page.waitForTimeout(1200);await page.screenshot({path:resolve(out,kind+'-program-run.png')});
  const entry={kind,url:frame.url(),diagnostics:await page.evaluate(()=>guest.diagnostics()),canvasCount:await frame.locator('canvas').count()};
  if(kind==='bbc')entry.machine=await frame.evaluate(()=>({model:processor.model?.name,pc:processor.pc,screen:Array.from({length:1000},(_,i)=>String.fromCharCode(processor.peekmem(0x7c00+i)&127)).join(''),programBytes:Array.from({length:128},(_,i)=>processor.peekmem(0x1900+i))}));
  if(kind==='bbc'){assert(entry.machine.screen.toUpperCase().includes('HELLO ED & VICCO'),'BBC real output missing');assert(entry.machine.programBytes[1]!==255,'BBC BASIC program missing');}console.log('RESET',kind);await page.evaluate(()=>guest.reset());await page.waitForTimeout(kind==='bbc'?14000:7000);await page.screenshot({path:resolve(out,kind+'-cold-reset.png')});
  if(kind==='bbc'){frame=page.frames().find(f=>f.url().startsWith('https://'));entry.resetScreen=await frame.evaluate(()=>Array.from({length:1000},(_,i)=>String.fromCharCode(processor.peekmem(0x7c00+i)&127)).join(''));assert(!entry.resetScreen.includes('Hello Ed'),'Cold reset retained program output');}
  entry.afterReset=await page.evaluate(()=>guest.diagnostics());assert.equal(entry.afterReset.generation,2);
  console.log('DISPOSE',kind);await page.evaluate(()=>guest.dispose());await page.waitForTimeout(100);entry.afterClose=await page.evaluate(()=>guest.diagnostics());entry.framesAfterClose=page.frames().length;assert.equal(entry.framesAfterClose,1);assert.equal(entry.afterClose.iframePresent,false);evidence.guests.push(entry);
 }
}finally {await writeFile(resolve(out,'acceptance.json'),JSON.stringify(evidence,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(evidence,null,2));

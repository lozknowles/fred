// API-only browser acceptance: GPU/WebGL are disabled; never opens the game.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=process.argv[2],edge=process.argv[3];if(!origin||!edge)throw Error('Usage: node test-public-fred-browser.mjs HTTPS_ORIGIN PUBLIC_FUNNEL_EDGE_IP');
const hostname=new URL(origin).hostname;
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-webgl','--disable-software-rasterizer',`--host-resolver-rules=MAP ${hostname} ${edge}`,'--proxy-server=direct://','--proxy-bypass-list=*']});
const contexts=[];const begin=Date.now();try{
 const connect=async label=>{const context=await browser.newContext();contexts.push(context);const page=await context.newPage();await page.goto(origin+'/api/period-sun/session');const cap=JSON.parse(await page.locator('body').innerText());
  const guest=await page.evaluate(async({csrf,label})=>{const r=await fetch('/api/period-sun/start',{method:'POST',headers:{'content-type':'application/json','x-fred-sun-token':csrf},body:JSON.stringify({system:'netbsd'})});if(r.status!==201)throw Error(await r.text());const guest=await r.json();window.g={text:'',phase:0,guest,csrf,label};const ws=new WebSocket(location.origin.replace('https:','wss:')+guest.wsPath+`?sessionId=${guest.sessionId}&ticket=${guest.ticket}`);window.g.ws=ws;window.g.input=s=>ws.send(JSON.stringify({type:'input',data:btoa(s)}));ws.onmessage=event=>{const v=JSON.parse(event.data),g=window.g;if(v.type==='ready'&&g.phase===0){g.phase=1;g.input('fred\r');}if(v.type==='output'){g.text+=atob(v.data);if(g.phase===1&&g.text.includes('Password:')){g.phase=2;g.input('sparc1993\r');}else if(g.phase===2&&g.text.includes('$ ')){g.phase=3;g.input('id; test ! -f ~/public-browser-a && echo CLEAN_BROWSER_SNAPSHOT; echo BROWSER_'+label+'_READY\r');}}};return guest;},{csrf:cap.csrf,label});return {page,context,guest,csrf:cap.csrf};};
 const [a,b]=await Promise.all([connect('A'),connect('B')]);for(const {page} of [a,b])await page.waitForFunction(()=>window.g.text.replace(/\r/g,'').includes('\nBROWSER_'+window.g.label+'_READY\n'),{},{timeout:180000});
 for(const {page} of [a,b]){const text=await page.evaluate(()=>window.g.text);assert.match(text,/uid=\d+\(fred\)/);assert.match(text.replace(/\r/g,''),/\nCLEAN_BROWSER_SNAPSHOT\n/);}
 await a.page.evaluate(()=>window.g.input('echo ONLY_BROWSER_A > ~/public-browser-a; cat ~/public-browser-a\r'));
 await a.page.waitForFunction(()=>/\nONLY_BROWSER_A\n/.test(window.g.text.replace(/\r/g,'')),{},{timeout:30000});
 await b.page.evaluate(()=>window.g.input('test ! -f ~/public-browser-a && echo BROWSER_B_ISOLATED\r'));await b.page.waitForFunction(()=>/\nBROWSER_B_ISOLATED\n/.test(window.g.text.replace(/\r/g,'')),{},{timeout:30000});
 const denied=await b.page.evaluate(async({sessionId,csrf})=>(await fetch('/api/period-sun/end',{method:'POST',headers:{'content-type':'application/json','x-fred-sun-token':csrf},body:JSON.stringify({sessionId})})).status,{sessionId:a.guest.sessionId,csrf:b.csrf});assert.equal(denied,404);
 const cookies=await Promise.all([a.context.cookies(),b.context.cookies()]);assert.notEqual(cookies[0][0].value,cookies[1][0].value);
 for(const [label,item] of [['A',a],['B',b]])await writeFile(`public-browser-${label}.log`,await item.page.evaluate(()=>window.g.text));
 await a.context.close();await b.page.evaluate(()=>window.g.input('echo BROWSER_B_SURVIVES_A_END; id\r'));await b.page.waitForFunction(()=>/\nBROWSER_B_SURVIVES_A_END\n/.test(window.g.text.replace(/\r/g,'')),{},{timeout:30000});await writeFile('public-browser-B.log',await b.page.evaluate(()=>window.g.text));
 console.log(JSON.stringify({externalOrigin:origin,forcedPublicEdge:edge,twoBrowserContexts:true,realNonRootGuests:true,writeReadbackBeforeOtherGuestAbsence:true,otherGuestSurvivesFirstClose:true,diskIsolation:true,crossEndRejected:true,gpuDisabled:true,elapsedMs:Date.now()-begin}));
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}

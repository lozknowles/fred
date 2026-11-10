/** Author-hosted real emulators. No ROMs, guest programs or remote credentials are bundled. */
export const MICRO_GUEST_PROVIDERS = Object.freeze({
 c64: Object.freeze({name:'Commodore 64',provider:'Tiny8bit by André Weissflog',url:'https://floooh.github.io/tiny8bit/c64.html',source:'https://github.com/floooh/chips-test',keyboard:'Click the screen before typing. The original C64 character set normally displays uppercase.'}),
 bbc: Object.freeze({name:'BBC Micro Model B',provider:'jsbeeb by Matt Godbolt',url:'https://bbc.xania.org/?model=B&keyLayout=natural&embed&noseek',source:'https://github.com/mattgodbolt/jsbeeb',keyboard:'Click the screen before typing. Natural keyboard layout is selected; F12 is BBC BREAK.'}),
});
export const C64_SNAKE = Object.freeze({name:'Snake',author:'David R. Van Wagner',license:'MIT',commit:'69a773924b6e436da836f980be0f0d99ef21623c',source:'https://github.com/davervw/c-snake/tree/69a773924b6e436da836f980be0f0d99ef21623c',url:'https://raw.githubusercontent.com/davervw/c-snake/69a773924b6e436da836f980be0f0d99ef21623c/snake64.prg',controls:'Z turns left; / turns right; Return pauses or resumes.'});

export const BBC_GRAPHICS_PROGRAM = [
 '10 MODE 2','20 FOR I=1 TO 7','30 GCOL 0,I','40 MOVE 640,512',
 '50 DRAW I*175,100','60 NEXT I','70 PRINT "Hello Ed & Vicco"'
].join('\n');

export function bbcProgramURL(text) {
 const program=String(text).replace(/\r\n?/g,'\n').trim();
 if(!program||program.length>2048||/[^\x20-\x7e\n]/.test(program))throw Error('Enter up to 2,048 printable BBC BASIC characters.');
 const url=new URL(MICRO_GUEST_PROVIDERS.bbc.url);
 // jsbeeb's autotype option presses keys on its virtual keyboard after boot.
 url.searchParams.set('autotype',program+'\nRUN\n');
 // jsbeeb also supports older URL parsers that use decodeURIComponent.
 return url.href.replaceAll('+','%20');
}

/** Call only following the host permission check and an explicit user activation. */
export function createMicroGuest({kind,document:doc=globalThis.document,onStatus=()=>{}}={}) {
 const provider=MICRO_GUEST_PROVIDERS[kind];
 if(!provider)throw new TypeError('Unsupported microcomputer');
 let iframe=null,closed=false,generation=0,state='starting',activeUrl=provider.url;
 const element=doc.createElement('section');element.className='period-micro-guest';
 Object.assign(element.style,{display:'flex',flexDirection:'column',width:'100%',height:'100%',minHeight:'360px',background:'#0b1015',color:'#edf4fa'});
 const info=doc.createElement('p');info.textContent=`Online emulator — ${provider.provider}. Requires its internet service. ${provider.keyboard} Cold reset clears this running machine. Closing discards unsaved work.`;
 const baseInfo=info.textContent;
 Object.assign(info.style,{margin:'8px',font:'13px/1.4 system-ui'});
 const note=doc.createElement('p');Object.assign(note.style,{margin:'0 8px 8px',font:'13px/1.4 system-ui'});note.setAttribute('role','status');
 const surface=doc.createElement('div');Object.assign(surface.style,{flex:'1',minHeight:'300px',position:'relative'});
 element.append(info,note,surface);
 function status(next){state=next;note.textContent=next==='loaded'?'Provider page loaded. Click its computer screen to use BASIC. If the screen is blank or an error is shown, cold reset or retry later.':next==='closed'?'Computer closed.':'Connecting to the online emulator…';onStatus(diagnostics());}
 function destroyFrame(){if(!iframe)return;iframe.onload=null;iframe.onerror=null;iframe.src='about:blank';iframe.remove();iframe=null;}
 function boot(url){if(closed)return false;activeUrl=url;generation++;destroyFrame();status('starting');const frame=doc.createElement('iframe');iframe=frame;frame.title=provider.name+' — '+provider.provider;frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('allow','autoplay');Object.assign(frame.style,{border:'0',width:'100%',height:'100%',position:'absolute',inset:'0',background:'black'});frame.onload=()=>{if(iframe===frame&&!closed)status('loaded');};frame.onerror=()=>{if(iframe===frame&&!closed){state='error';note.textContent='Online emulator could not load. Retry when its service is available.';onStatus(diagnostics());}};frame.src=url;surface.append(frame);return true;}
 function reset(){info.textContent=baseInfo;return boot(provider.url);}
 function loadGame(){if(kind!=='c64'||closed)return false;const url=new URL(provider.url);url.searchParams.set('file',C64_SNAKE.url);info.textContent=`Online emulator — ${provider.provider}. Snake by ${C64_SNAKE.author} (MIT), downloaded from the pinned author source. Loading clears prior machine RAM. ${C64_SNAKE.controls} Cold reset returns to BASIC.`;return boot(url.href);}
 function diagnostics(){return {kind,provider:provider.provider,url:activeUrl,online:true,state,generation,iframePresent:!!iframe,readiness:'Cross-origin page load is not proof of BASIC readiness.',guestStateScope:'local browser session; not shared with other players'};}
 function focus(){if(!closed)iframe?.focus();}
 function dispose(){if(closed)return;closed=true;destroyFrame();status('closed');element.remove();}
 function runProgram(text){if(kind!=='bbc'||closed)return false;return boot(bbcProgramURL(text));}
 reset();return {element,reset,focus,dispose,diagnostics,loadGame,runProgram};
}

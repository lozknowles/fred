import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import {chmod,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const PROVIDER_HOSTS=Object.freeze({codex:Object.freeze(['auth.openai.com','api.openai.com','chatgpt.com','ab.chatgpt.com']),claude:Object.freeze(['claude.ai','api.anthropic.com','console.anthropic.com','platform.claude.com','auth.anthropic.com'])});
export function publicAddress(address){
 const family=net.isIP(address);if(family===4){const b=address.split('.').map(Number);const [a,c,d]=b;return !(a===0||a===10||a===127||a>=224||(a===100&&c>=64&&c<=127)||(a===169&&c===254)||(a===172&&c>=16&&c<=31)||(a===192&&(c===168||c===0||c===2||(c===88&&d===99)))||(a===198&&(c===18||c===19||(c===51&&d===100)))||(a===203&&c===0&&d===113));}
 if(family!==6||address.includes('.')||address.includes('%'))return false;
 const sides=address.toLowerCase().split('::');if(sides.length>2)return false;
 const head=sides[0]?sides[0].split(':'):[],tail=sides[1]?sides[1].split(':'):[];
 const groups=sides.length===2?[...head,...Array(8-head.length-tail.length).fill('0'),...tail]:head;
 if(groups.length!==8)return false;const values=groups.map(x=>parseInt(x,16));
 return values[0]>=0x2000&&values[0]<0x3fff&&values[0]!==0x2002&&!(values[0]===0x2001&&(values[1]<0x200||values[1]===0xdb8));
}
export async function pinnedAddress(host,lookup=dns.lookup){const addresses=await lookup(host,{all:true,verbatim:true});if(!addresses.length||addresses.some(item=>!publicAddress(item.address)||net.isIP(item.address)!==item.family))throw Error('Destination denied');return addresses[0];}
export async function startConnectProxy({socketPath,provider,lookup=dns.lookup,connect=net.connect,maxConnections=16}={}){
 const allowed=PROVIDER_HOSTS[provider];if(!allowed||typeof socketPath!=='string'||socketPath.length>100)throw Error('Invalid proxy configuration');
 const sockets=new Set();let pending=0;
 const server=http.createServer({maxHeaderSize:4096,requestTimeout:10000,headersTimeout:10000},(_request,response)=>{response.writeHead(405,{'Connection':'close'});response.end();});
 server.on('connection',socket=>{if(sockets.size>=maxConnections){socket.destroy();return;}sockets.add(socket);socket.on('error',()=>socket.destroy());socket.setTimeout(15000,()=>socket.destroy());socket.on('close',()=>sockets.delete(socket));});
 server.on('clientError',(_error,socket)=>socket.destroy());
 server.on('connect',async(request,client,head)=>{
  if(!sockets.has(client)||pending>=maxConnections){client.destroy();return;}
  const match=/^([a-z0-9.-]+):443$/.exec(request.url||'');
  if(!match||!allowed.includes(match[1])||request.headers['transfer-encoding']||request.headers['content-length']||request.headers['proxy-authorization']||head.length>65536){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  pending++;let remote;
  try{
   const timeout=new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('DNS timeout')),5000);timer.unref();});
   const target=await Promise.race([pinnedAddress(match[1],lookup),timeout]);if(client.destroyed)return;
   remote=connect({host:target.address,family:target.family,port:443});sockets.add(remote);
   remote.setTimeout(120000,()=>remote.destroy());remote.on('error',()=>client.destroy());remote.on('close',()=>{sockets.delete(remote);client.destroy();});client.on('close',()=>remote.destroy());
   remote.once('connect',()=>{if(client.destroyed){remote.destroy();return;}client.setTimeout(120000,()=>client.destroy());client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);client.pipe(remote);remote.pipe(client);});
  }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');remote?.destroy();}
  finally{pending--;}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await chmod(socketPath,0o600);
 return {server,async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await unlink(socketPath).catch(()=>{});}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [socketPath,provider]=process.argv.slice(2);const proxy=await startConnectProxy({socketPath,provider});process.stdout.write('ready\n');
 const close=async()=>{await proxy.close();process.exit(0);};process.on('SIGTERM',close);process.on('SIGINT',close);process.stdin.resume();process.stdin.on('end',close);
}

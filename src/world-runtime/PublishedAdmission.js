import {hostedRepositorySource} from './HostedRepository.js';
import {verifyPublishedData,restorePublishedData} from './PublishedAdmissionData.js';
export async function admitPublishedWorld(entry,{baseURL,fetcher,signal}){
 signal.throwIfAborted();
 const source=hostedRepositorySource(entry.bundlePath,{baseURL,origin:new URL(baseURL).origin,fetch:fetcher});
 // Custom test/embedded transports must stay on their supplied byte reader.
 let worker;if(!import.meta.env?.DEV&&typeof Worker==='function'&&fetcher===globalThis.fetch){
  try{worker=new Worker(new URL('./PublishedAdmission.worker.js',import.meta.url),{type:'module'});}catch{/* A runtime without worker support still uses the full validator. */}
 }
 let data;if(!worker)data=await verifyPublishedData(source,entry);else{
  data=await new Promise((resolve,reject)=>{
   const stop=e=>{worker.terminate();signal.removeEventListener('abort',abort);e?reject(e):null;};
   const abort=()=>stop(signal.reason??Error('Published admission aborted'));
   signal.addEventListener('abort',abort,{once:true});
   worker.onerror=()=>stop(Error('Published validation worker failed'));
   worker.onmessageerror=()=>stop(Error('Unreadable published validation result'));
   worker.onmessage=({data:r})=>{if(r?.ok===true){stop();resolve(r.data);}else stop(Error(r?.error??'Published validation failed'));};
   try{if(signal.aborted)abort();else worker.postMessage({entry:{bundlePath:entry.bundlePath,worldId:entry.worldId,contentDigest:entry.contentDigest},baseURL});}catch(e){stop(e);}
  });
 }
 signal.throwIfAborted();return restorePublishedData(data,source,entry);
}

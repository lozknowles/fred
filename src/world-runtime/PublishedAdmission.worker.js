import {hostedRepositorySource} from './HostedRepository.js';
import {verifyPublishedData} from './PublishedAdmissionData.js';
self.onmessage=async({data:{entry,baseURL}})=>{
 try{
  const source=hostedRepositorySource(entry.bundlePath,{baseURL,origin:self.location.origin});
  self.postMessage({ok:true,data:await verifyPublishedData(source,entry)});
 }catch(error){self.postMessage({ok:false,error:String(error.message??error)});}
};

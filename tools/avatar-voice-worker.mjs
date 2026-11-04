// Run only on the operator's private voice host, under an OS flock.
import {loadPrivateSpeechProvider} from './networking/SpeechProvider.mjs';
import {cleanSpeechText,MAX_SPEECH_LENGTH} from '../src/network/SpeechText.js';

try {
 let size=0;const chunks=[];
 for await(const chunk of process.stdin){size+=chunk.length;if(size>2048)throw Error('request');chunks.push(chunk);}
 const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!input||Object.keys(input).join(',')!=='text'||typeof input.text!=='string'||input.text.length>MAX_SPEECH_LENGTH)throw Error('request');
 const text=cleanSpeechText(input.text);if(!text)throw Error('request');
 const provider=await loadPrivateSpeechProvider(process.argv[2]);if(!provider)throw Error('configuration');
 // The installed worker uses HTTPServer (one handler at a time). A completed
 // health response establishes that any earlier timed-out inference finished.
 // Never queue synthesis while that readiness probe is still outstanding.
 let response;
 try{response=await fetch(provider.endpoint+'/voice-lab/health',{headers:{authorization:'Bearer '+provider.token},signal:AbortSignal.timeout(8000)});}
 catch(error){if(error.name==='TimeoutError')error.voiceBusy=true;throw error;}
 if(!response.ok)throw Error('unavailable');
 const health=await response.json();if(!health.available||health.version!==provider.version||health.shared_existing_model!==true)throw Error('identity');
 const result=await provider.synthesize(text,'loz-omnivoice');if(!result)throw Error('unavailable');
 process.stdout.write(result.audio);
}catch(error){
 // No submitted text, paths, credentials, or model state in remote diagnostics.
 process.stderr.write('Private voice request could not complete.\n');process.exitCode=error.voiceBusy?75:1;
}

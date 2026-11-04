const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com']);
export const MAX_YOUTUBE_START=86400;
function timestamp(value){
 if(/^\d+$/.test(value))return Number(value);
 const match=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
 if(!match||!match.slice(1).some(Boolean))throw Error('Use a valid YouTube timestamp.');
 return Number(match[1]??0)*3600+Number(match[2]??0)*60+Number(match[3]??0);
}
/** Session input only: never used to edit the authored media-screen config.
 * Only a video ID/start reaches the embed; search opens youtube.com itself.
 * https://developers.google.com/youtube/player_parameters
 */
export function parseYouTubeSelection(value){
 const input=String(value??'').trim();
 if(input.length>2048||/\s/.test(input))throw Error('Paste a YouTube video link or its 11-character video ID.');
 if(VIDEO_ID.test(input))return {videoId:input,start:0,hasStart:false};
 let url;try{url=new URL(input);}catch{throw Error('Paste a YouTube video link or its 11-character video ID.');}
 // Reject explicit ports including :443 (URL.port normalizes default ports).
 const authority=/^https:\/\/([^/?#]+)/i.exec(input)?.[1];
 if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.username||url.password||authority?.toLowerCase()!==url.hostname)throw Error('Use an HTTPS link from YouTube, without a port or sign-in details.');
 let videoId;
 if(url.hostname==='youtu.be')videoId=/^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
 else if(url.pathname==='/watch'&&!url.hostname.endsWith('youtube-nocookie.com'))videoId=url.searchParams.getAll('v').length===1?url.searchParams.get('v'):null;
 else videoId=/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
 if(!VIDEO_ID.test(videoId??''))throw Error('This link does not identify a YouTube video.');
 const times=[...url.searchParams.getAll('t'),...url.searchParams.getAll('start')];
 if(url.hash){const fragment=new URLSearchParams(url.hash.slice(1));times.push(...fragment.getAll('t'),...fragment.getAll('start'));}
 if(times.length>1)throw Error('Use only one video timestamp.');
 const start=times.length?timestamp(times[0]):0;
 if(!Number.isSafeInteger(start)||start<0||start>MAX_YOUTUBE_START)throw Error('The video timestamp must be between 0 and 86400 seconds.');
 return {videoId,start,hasStart:times.length>0};
}
export function youtubeWatchURL({videoId,start=0}){
 if(!VIDEO_ID.test(videoId??''))throw Error('Invalid video ID');
 const url=new URL('https://www.youtube.com/watch');url.searchParams.set('v',videoId);
 if(start>0)url.searchParams.set('t',String(start));return url.href;
}

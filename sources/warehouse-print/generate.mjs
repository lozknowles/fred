// Original procedural architectural print, Copyright (c) 2026 Lawrence Knight. MIT.
// No external image, model inference, or downloaded content is used.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(t,b){const a=Buffer.from(t),o=Buffer.alloc(12+b.length);o.writeUInt32BE(b.length);a.copy(o,4);b.copy(o,8);o.writeUInt32BE(crc(Buffer.concat([a,b])),8+b.length);return o;}
function png(w,h,pixels){const rows=Buffer.alloc(h*(1+w*3));for(let y=0;y<h;y++)pixels.copy(rows,y*(1+w*3)+1,y*w*3,(y+1)*w*3);const hd=Buffer.alloc(13);hd.writeUInt32BE(w);hd.writeUInt32BE(h,4);hd[8]=8;hd[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hd),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const w=768,h=1152,p=Buffer.alloc(w*h*3);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const u=x/w,v=y/h, dx=u-.5,dy=v-.48, ray=Math.abs(dx)/(Math.abs(dy)+.05);
 let c=202-30*v;
 // Quiet sepia warehouse study: central daylight, converging rafters and masonry.
 if(v<.48){c=170+48*(1-Math.min(1,Math.abs(dx)*1.8));if(Math.abs(dx)<(.48-v)*.24+.035)c=230; if(Math.abs(((ray*4)%1)-.5)<.035)c-=61;}
 else{c=172+36*(1-Math.abs(dx)*1.4);const depth=(v-.48)/.52;if(Math.abs(((depth*depth*20)%1)-.5)<.025)c-=27; if(Math.abs(dx)<.07*(1+depth*4))c+=8;}
 if(Math.abs(dx)>.16+.26*Math.abs(dy)) {c-=31;const q=(u<.5?u:1-u);if((Math.floor(v*90)%2===0? q*48:q*48+.5)%1<.065||v*90%1<.045)c-=18;}
 if(Math.abs(dx)<.095&&v>.38&&v<.65)c=142;
 if(Math.abs(dx)<.076&&v>.40&&v<.64)c=212;
 const grain=((x*73+y*151+(x*y)%137)%29)-14;c+=grain*.35;
 if(u<.055||u>.945||v<.045||v>.955)c=222+grain*.12;
 const i=(y*w+x)*3;p[i]=Math.min(255,c+9);p[i+1]=Math.min(255,c+3);p[i+2]=Math.max(0,c-10);
}
const coarse=Buffer.alloc(32*48*3);for(let y=0;y<48;y++)for(let x=0;x<32;x++)for(let c=0;c<3;c++){let sum=0;for(let yy=0;yy<24;yy++)for(let xx=0;xx<24;xx++)sum+=p[(((y*24+yy)*w+x*24+xx)*3)+c];coarse[(y*32+x)*3+c]=Math.round(sum/576);}
const source='assets/2ebe9db069ecc4e37d7e4d8a46e721489f2412eef017f0408382d69d6762a71f.glb',original=fs.readFileSync(path.join(root,source)),jl=original.readUInt32LE(12),base=JSON.parse(original.subarray(20,20+jl)),bin=original.subarray(28+jl);
base.materials[0].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];base.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
base.images=[{bufferView:4,mimeType:'image/png'}];base.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];base.textures=[{sampler:0,source:0}];
const refs=[];for(const [label,iw,ih,pixels] of [['coarse',32,48,coarse],['fine',w,h,p]]){
 const img=png(iw,ih,pixels),j=structuredClone(base);j.bufferViews.push({buffer:0,byteOffset:912,byteLength:img.length});j.buffers[0].byteLength=912+img.length;let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let payload=Buffer.concat([bin.subarray(0,912),img]);payload=Buffer.concat([payload,Buffer.alloc((4-payload.length%4)%4)]);const out=Buffer.alloc(28+json.length+payload.length);out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(payload.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);payload.copy(out,28+json.length);const hash=sha(out),ref={path:`assets/${hash}.glb`,sha256:hash,bytes:out.length};fs.writeFileSync(path.join(root,ref.path),out);fs.writeFileSync(path.join(import.meta.dirname,`${label}.png`),img);refs.push({label,width:iw,height:ih,...ref});
}
fs.writeFileSync(path.join(import.meta.dirname,'tiers.json'),JSON.stringify({original:source,nonImageSHA256:sha(bin.subarray(0,912)),tiers:refs},null,2)+'\n');
console.log(JSON.stringify(refs,null,2));

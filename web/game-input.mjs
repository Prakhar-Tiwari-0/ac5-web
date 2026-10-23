// Apache-2.0. User-local validation only. Executable bytes are never uploaded.
export const SUPPORTED_ELF={name:'SLUS_208.51',size:3634092,sha256:'c3594227605307806592416dbd723bf5771952e279ee281a40da305426667385'};
export async function identifyExecutable(file){
 if(!(file instanceof Blob))throw Error('Expected a local executable File');
 if(file.size!==SUPPORTED_ELF.size)return{valid:false,code:'ELF_SIZE_MISMATCH',expected:SUPPORTED_ELF.size,actual:file.size};
 const bytes=await file.arrayBuffer(),h=new Uint8Array(bytes,0,20),header=h[0]===0x7f&&h[1]===69&&h[2]===76&&h[3]===70&&h[4]===1&&h[5]===1&&h[18]===8&&h[19]===0;
 if(!header)return{valid:false,code:'ELF_FORMAT_MISMATCH',expected:'ELF32 little-endian MIPS'};
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 return{valid:sha256===SUPPORTED_ELF.sha256,code:sha256===SUPPORTED_ELF.sha256?'SUPPORTED_ELF':'ELF_HASH_MISMATCH',sha256,bytes:file.size};
}
export async function readBuildStatus(){
 const response=await fetch('/local/retail.json',{cache:'no-store'});
 if(response.status===404)return{available:false,code:'RETAIL_MODULE_MISSING',message:'No retail build manifest. Use the local build command with the supported executable.'};
 if(!response.ok)throw Error(`Build manifest HTTP ${response.status}`);
 const manifest=await response.json();return{available:true,manifest};
}

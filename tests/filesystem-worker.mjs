import create from '/local/gs-probe.mjs';
import {mountDisc,mountCards} from '/browser/mount.mjs';
self.onmessage=async({data:m})=>{
 try{
  if(m.file){try{new FileReaderSync().readAsArrayBuffer(m.file.slice(32768,34816));}catch(e){throw Error('direct fixture read: '+e.message);}}
  const module=await create({printErr:()=>{}}),initialBytes=module._ac5_linear_bytes();let disc;const reads=[];
  const old=module.WORKERFS.stream_ops.read;module.WORKERFS.stream_ops.read=function(stream,buffer,offset,length,position){reads.push({position,length,size:stream.node.size});try{return old.call(this,stream,buffer,offset,length,position);}catch(e){throw Error(e.message+' '+JSON.stringify(reads));}};
  if(m.file){disc=mountDisc(module,m.file);const rc=module._ac5_vfs_probe();if(rc)throw Error('original VFS probe '+rc);}
  const afterDiscBytes=module._ac5_linear_bytes(),cards=await mountCards(module);
  // A second session in the same origin must be rejected while this lease holds.
  let duplicateRejected=false;try{await mountCards(module);}catch(e){duplicateRejected=e.message.includes('another runtime');}
  if(!duplicateRejected)throw Error('card lease did not reject duplicate writer');
  const rc=m.mode==='write'?module._ac5_card_write():module._ac5_card_read();if(rc)throw Error('original card RPC '+rc);
  await cards.flush();const cardBytes=module.FS.stat('/saves/card0.ps2mc').size,magic=String.fromCharCode(...module.FS.readFile('/saves/card0.ps2mc').slice(0,7));
  await cards.close();postMessage({ok:true,mode:m.mode,disc,initialBytes,afterDiscBytes,afterCardBytes:module._ac5_linear_bytes(),cardBytes,magic,duplicateRejected});
 }catch(e){postMessage({ok:false,error:e.message,stack:e.stack});}
};

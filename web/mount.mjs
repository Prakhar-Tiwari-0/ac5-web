// Apache-2.0. Worker-side adapters for the original C stdio-based VFS/cards.
export function mountDisc(module,file){
 if(typeof FileReaderSync==='undefined')throw Error('Disc filesystem must run in a dedicated worker');
 if(!module.FS||!module.WORKERFS)throw Error('Build must export FS and WORKERFS and link -lworkerfs.js');
 module.FS.mkdir('/disc');module.FS.mount(module.WORKERFS,{blobs:[{name:'game.iso',data:file}]},'/disc');
 return{path:'/disc/game.iso',bytes:file.size,copiedToLinearMemory:false};
}
export async function mountCards(module,{path='/saves',lockName='ac5-runtime-memory-cards'}={}){
 if(!/^\/[A-Za-z0-9_-]+$/.test(path))throw Error('Invalid card mount path');
 if(typeof lockName!=='string'||!lockName.length)throw Error('Invalid card writer lock');
 if(!navigator.locks)throw Error('Web Locks required to prevent concurrent card writers');
 let release;
 const hold=new Promise(r=>release=r);
 return new Promise((resolve,reject)=>{
  navigator.locks.request(lockName,{ifAvailable:true},async lock=>{
   if(!lock){reject(Error('Memory cards are in use by another runtime tab'));return;}
   try{
    if(!module.FS||!module.IDBFS)throw Error('Build must export FS and IDBFS and link -lidbfs.js');
    module.FS.mkdir(path);module.FS.mount(module.IDBFS,{},path);
    const sync=populate=>new Promise((yes,no)=>module.FS.syncfs(populate,e=>e?no(e):yes()));
    await sync(true);let pending=Promise.resolve(),closed=false;
    const session={flush:()=>{if(closed)throw Error('Card session closed');return pending=pending.then(()=>sync(false));},close:async()=>{if(closed)return;closed=true;try{await pending;await sync(false);}finally{release();}}};
    resolve(session);await hold;
   }catch(e){release();reject(e);}
  }).catch(reject);
 });
}

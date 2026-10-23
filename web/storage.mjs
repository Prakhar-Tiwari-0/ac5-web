// Apache-2.0. Files stay local. Range bounds avoid copying a disc into linear memory.
export function checkRange(file,offset,length,max=4*1024*1024){
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>max||offset+length>file.size)throw RangeError('Invalid or oversized local file range');
}
export async function readRange(file,offset,length){checkRange(file,offset,length);return new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());}
export class SaveStore{
 async open(){if(this.db)return this;this.db=await new Promise((yes,no)=>{const r=indexedDB.open('ac5-browser-runtime',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves');r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('Save database upgrade blocked by another tab'));});return this;}
 async transaction(mode,key,value){await this.open();return new Promise((yes,no)=>{const t=this.db.transaction('saves',mode),store=t.objectStore('saves'),r=mode==='readwrite'?store.put(value,key):store.get(key);let result;r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>yes(result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||Error('Save transaction aborted'));});}
 async put(name,bytes){if(!/^[a-zA-Z0-9._-]{1,80}$/.test(name)||bytes.byteLength>16*1024*1024)throw Error('Invalid save name or size');return this.transaction('readwrite',name,new Uint8Array(bytes));}
 async get(name){return this.transaction('readonly',name);}
 close(){this.db?.close();this.db=null;}
}

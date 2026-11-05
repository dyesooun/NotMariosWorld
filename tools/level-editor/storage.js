const openDatabase=()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('level-companion',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('documents');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function readStored(key){const db=await openDatabase();try{return await new Promise((resolve,reject)=>{const request=db.transaction('documents').objectStore('documents').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function writeStored(values){const db=await openDatabase();try{await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite');for(const[key,value]of Object.entries(values))tx.objectStore('documents').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}

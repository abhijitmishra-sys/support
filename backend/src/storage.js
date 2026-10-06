import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config.js';
import { requireThat } from './domain.js';
export async function storeAttachment(input){
 requireThat(/^[A-Za-z0-9+/]*={0,2}$/.test(input.data),422,'INVALID_FILE','Invalid file encoding.');
 const bytes=Buffer.from(input.data,'base64');requireThat(bytes.length>0&&bytes.length<=5*1024*1024,413,'FILE_TOO_LARGE','Attachments must be 5 MB or smaller.');
 const detected=await fileTypeFromBuffer(bytes);let mime=detected?.mime;
 if(!mime&&input.mime==='text/plain'&&!bytes.includes(0)&&!bytes.toString('utf8').includes('\ufffd'))mime='text/plain';
 requireThat(['image/png','image/jpeg','application/pdf','text/plain'].includes(mime),415,'UNSUPPORTED_FILE','Use PNG, JPG, PDF, or plain text.');
 let scanStatus='UNSCANNED';
 if(config.SCANNER_URL){const response=await fetch(config.SCANNER_URL,{method:'POST',body:bytes,headers:{'content-type':'application/octet-stream'},signal:AbortSignal.timeout(15000)});requireThat(response.ok,503,'SCAN_UNAVAILABLE','File scanning is unavailable.');const result=await response.json();requireThat(result.clean===true,422,'FILE_REJECTED','Attachment failed its security check.');scanStatus='CLEAN';}
 const storageKey=crypto.randomUUID();await fs.mkdir(config.UPLOAD_DIRECTORY,{recursive:true});await fs.writeFile(path.join(config.UPLOAD_DIRECTORY,storageKey),bytes,{flag:'wx',mode:0o600});
 return {storageKey,mime,size:bytes.length,fileName:input.fileName.replace(/[\r\n"/\\]/g,'_').slice(0,160),scanStatus};
}
export const readAttachment=key=>fs.readFile(path.join(config.UPLOAD_DIRECTORY,key));

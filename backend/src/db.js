import { PrismaClient } from '@prisma/client';
import pino from 'pino';
export const db = new PrismaClient();
export const logger = pino({redact:['req.headers.authorization','token','password','secret','body']});
export async function transaction(fn){
 for(let attempt=0;attempt<4;attempt++){
  try{return await db.$transaction(fn,{isolationLevel:'Serializable',maxWait:10000,timeout:15000});}
  catch(e){if(e.code!=='P2034'||attempt===3)throw e;await new Promise(r=>setTimeout(r,25*(attempt+1)));}
 }
}

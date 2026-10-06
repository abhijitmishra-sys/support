import { config } from './config.js';
import { db,logger } from './db.js';
import { slaSweep,sendEmails } from './jobs.js';
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
while(!stopping){
 try{await slaSweep();await sendEmails();}catch(e){logger.error({error:e.name,code:e.code},'Worker cycle failed');}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
await db.$disconnect();

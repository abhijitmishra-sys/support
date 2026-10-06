import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { makeApp } from './app.js';
import { config } from './config.js';
import { db,logger } from './db.js';
import { verify,staff,requireThat } from './domain.js';
import { visibleTicket,addMessage } from './service.js';
import { drainOutbox,dispatchWorkspace } from './jobs.js';
import { z } from 'zod';

export async function startServer(port=config.PORT){
 let redis=null,subscriber=null;
 if(config.REDIS_URL){redis=createClient({url:config.REDIS_URL});redis.on('error',e=>logger.error({error:e.name},'Redis error'));await redis.connect();subscriber=redis.duplicate();await subscriber.connect();}
 const app=makeApp({redis}),server=http.createServer(app);
 const io=new Server(server,{cors:{origin:config.SITE_ORIGIN},transports:['websocket'],maxHttpBufferSize:64000,allowRequest:(req,callback)=>callback(null,req.headers.origin===config.SITE_ORIGIN)});
 io.use(async(socket,next)=>{
  try{
   const claims=verify(socket.handshake.auth.token,config.SOCKET_SECRET,'irma-socket');
   if(claims.sessionHash){const session=await db.authSession.findUnique({where:{tokenHash:claims.sessionHash}});requireThat(session&&session.userId===claims.sub&&session.expiresAt>new Date(),401,'UNAUTHENTICATED','Session expired.');}
   const membership=await db.membership.findUnique({where:{workspaceId_userId:{workspaceId:claims.workspaceId,userId:claims.sub}},include:{workspace:true,user:true}});
   requireThat(membership,403,'FORBIDDEN','Workspace access required.');socket.data.context={user:membership.user,membership,workspace:membership.workspace};socket.data.expiresAt=claims.exp;socket.data.sessionHash=claims.sessionHash;next();
  }catch{next(new Error('Session unavailable.'));}
 });
 io.on('connection',socket=>{
  const c=socket.data.context;socket.join('user:'+c.workspace.id+':'+c.user.id);
  let calls=[];
  socket.use(async(packet,next)=>{try{if(socket.data.sessionHash){const session=await db.authSession.findUnique({where:{tokenHash:socket.data.sessionHash}});requireThat(session&&session.expiresAt>new Date(),401,'UNAUTHENTICATED','Session expired.');}calls=calls.filter(t=>Date.now()-t<10000);requireThat(calls.length<40,429,'RATE_LIMITED','Slow down.');calls.push(Date.now());const m=await db.membership.findUnique({where:{id:c.membership.id},include:{workspace:true}});requireThat(m&&socket.data.expiresAt>Date.now()/1000,401,'UNAUTHENTICATED','Session expired.');c.membership=m;c.workspace=m.workspace;next();}catch(e){next(e);}});
  const timeout=setTimeout(()=>{socket.emit('session:expired');socket.disconnect(true);},Math.max(0,socket.data.expiresAt*1000-Date.now()));
  socket.on('ticket:subscribe',async(input,ack=()=>{})=>{try{const t=await visibleTicket(c,z.string().uuid().parse(input.ticketId));socket.join('ticket:'+t.id);if(staff(c.membership.role))socket.join('ticket-staff:'+t.id);ack({ok:true});}catch{ack({ok:false,error:'Ticket unavailable.'});}});
  socket.on('ticket:unsubscribe',input=>{if(typeof input?.ticketId==='string'){socket.leave('ticket:'+input.ticketId);socket.leave('ticket-staff:'+input.ticketId);}});
  socket.on('typing',async input=>{try{const t=await visibleTicket(c,z.string().uuid().parse(input.ticketId));socket.to('ticket:'+t.id).emit('typing',{ticketId:t.id,userId:c.user.id,name:c.user.name,typing:!!input.typing});}catch{}});
  socket.on('message:send',async(input,ack=()=>{})=>{try{const value=z.object({ticketId:z.string().uuid(),body:z.string().trim().min(1).max(12000),private:z.boolean().default(false),clientId:z.string().min(8).max(100),attachmentIds:z.array(z.string().uuid()).max(5).default([]),mentionIds:z.array(z.string().uuid()).max(10).default([])}).parse(input);const result=await addMessage(c,value.ticketId,value);ack({ok:true,data:result});}catch(e){ack({ok:false,error:e.status&&e.status<500?e.message:'Message could not be saved.'});}});
  socket.on('disconnect',()=>clearTimeout(timeout));
 });
 function emit(item){
  const payload={...item.payload,eventId:item.id};
  if(item.type==='NOTIFICATION')io.local.to('user:'+item.workspaceId+':'+payload.userId).emit('notification',payload);
  if(item.type==='TICKET_EVENT')io.local.to((payload.private?'ticket-staff:':'ticket:')+payload.ticketId).emit('ticket:event',payload);
  if(item.type==='ACCESS_CHANGED')io.local.in('user:'+item.workspaceId+':'+payload.userId).disconnectSockets(true);
 }
 if(subscriber)await subscriber.subscribe('irma-events',raw=>{try{emit(JSON.parse(raw));}catch(e){logger.warn({error:e.name},'Invalid internal event');}});
 let draining=false;
 const interval=setInterval(async()=>{if(draining)return;draining=true;try{await drainOutbox(async item=>{if(redis)await redis.publish('irma-events',JSON.stringify(item));else emit(item);});}catch(e){logger.error({error:e.name},'Outbox sweep failed');}finally{draining=false;}},1000);
 await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));logger.info({port:server.address().port},'Support API started');
 async function close(){clearInterval(interval);await new Promise(resolve=>io.close(resolve));if(subscriber)await subscriber.quit();if(redis)await redis.quit();await db.$disconnect();}
 return {app,server,io,close};
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
 const service=await startServer();let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(stopping)return;stopping=true;await service.close();process.exit(0);});
}

import { db,transaction,logger } from './db.js';
import { staff,compareQueue } from './domain.js';
import { notify,audit,ticketInclude } from './service.js';
import { config } from './config.js';
import nodemailer from 'nodemailer';

export async function dispatchWorkspace(workspaceId){
 return transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
  const workspace=await tx.workspace.findUnique({where:{id:workspaceId}});if(!workspace)return;
  const candidates=await tx.ticket.findMany({where:{workspaceId,assigneeId:null,archivedAt:null,mergedIntoId:null,status:{in:['OPEN','REOPENED']}},include:ticketInclude,take:500,orderBy:{createdAt:'asc'}});
  candidates.sort((a,b)=>compareQueue(a,b,Date.now(),workspace.settings.agingMinutes));
  const agents=await tx.membership.findMany({where:{workspaceId,role:{in:['AGENT','SUPERVISOR','ADMIN']},available:true,heartbeatAt:{gt:new Date(Date.now()-90000)}},orderBy:{userId:'asc'}});
  const workload={};for(const a of agents)workload[a.userId]=await tx.ticket.count({where:{workspaceId,assigneeId:a.userId,archivedAt:null,status:{notIn:['RESOLVED','CLOSED']}}});
  for(const ticket of candidates){
   const eligible=agents.filter(a=>workload[a.userId]<a.capacity&&(!ticket.teamId||a.teamId===ticket.teamId)&&(!a.skills.length||a.skills.includes(ticket.category))).sort((a,b)=>workload[a.userId]-workload[b.userId]||a.userId.localeCompare(b.userId));
   const agent=eligible[0];if(!agent)continue;
   const claimed=await tx.ticket.updateMany({where:{id:ticket.id,assigneeId:null,version:ticket.version},data:{assigneeId:agent.userId,status:'IN_PROGRESS',version:{increment:1}}});
   if(!claimed.count)continue;workload[agent.userId]++;
   const context={workspace,user:{id:agent.userId}};
   await audit(tx,context,ticket.id,'AUTO_ASSIGNED',{assigneeId:agent.userId});
   await notify(tx,context,{...ticket,assigneeId:agent.userId},'ASSIGNED','Support agent assigned');
  }
 });
}
export async function slaSweep(){
 const workspaces=await db.workspace.findMany();
 for(const workspace of workspaces){
  await transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspace.id+'sla'}))`;
   const pending=await tx.slaCycle.findMany({where:{ticket:{workspaceId:workspace.id},respondedAt:null,pausedAt:null,dueAt:{lte:new Date(Date.now()+workspace.settings.warningMinutes*60000)}},include:{ticket:true},take:1000});
   for(const cycle of pending){
    const breached=cycle.dueAt.getTime()<=Date.now();if(breached?cycle.breachedAt:cycle.warnedAt)continue;
    await tx.slaCycle.update({where:{id:cycle.id},data:breached?{breachedAt:new Date()}:{warnedAt:new Date()}});
    const canonical=cycle.ticket.mergedIntoId?await tx.ticket.findUnique({where:{id:cycle.ticket.mergedIntoId}}):cycle.ticket;
    const leads=await tx.membership.findMany({where:{workspaceId:workspace.id,role:{in:['SUPERVISOR','ADMIN']}}});
    const title=breached?'Response deadline breached':'Response deadline approaching';
    await audit(tx,{workspace,user:{id:null}},canonical.id,breached?'SLA_BREACH':'SLA_WARNING',{cycleId:cycle.id,kind:cycle.kind});
    for(const lead of leads){const n=await tx.notification.create({data:{workspaceId:workspace.id,userId:lead.userId,ticketId:canonical.id,type:breached?'SLA_BREACH':'SLA_WARNING',title}});await tx.outbox.create({data:{workspaceId:workspace.id,type:'NOTIFICATION',payload:JSON.parse(JSON.stringify({userId:lead.userId,notification:n}))}});}
   }
   if(workspace.settings.autoCloseHours){
    const resolved=await tx.ticket.findMany({where:{workspaceId:workspace.id,status:'RESOLVED',resolvedAt:{lt:new Date(Date.now()-workspace.settings.autoCloseHours*3600000)},archivedAt:null},take:500});
    for(const t of resolved){await tx.ticket.update({where:{id:t.id},data:{status:'CLOSED',version:{increment:1}}});await audit(tx,{workspace,user:{id:null}},t.id,'AUTO_CLOSED',{});}
   }
  });
  await dispatchWorkspace(workspace.id);
 }
}
export async function drainOutbox(deliver){
 await transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('irma-outbox'))`;
  const items=await tx.outbox.findMany({where:{dispatchedAt:null,attempts:{lt:8},availableAt:{lte:new Date()}},orderBy:{createdAt:'asc'},take:100});
  for(const item of items){
   try{await deliver(item);await tx.outbox.update({where:{id:item.id},data:{dispatchedAt:new Date(),attempts:{increment:1},error:null}});}
   catch(e){await tx.outbox.update({where:{id:item.id},data:{attempts:{increment:1},availableAt:new Date(Date.now()+Math.min(300000,1000*2**item.attempts)),error:'DELIVERY_FAILED'}});logger.warn({eventId:item.id,operation:'outbox',error:e.name},'Delivery will retry');}
  }
 });
}
export async function sendEmails(){
 if(!config.SMTP_HOST||!config.SMTP_FROM)return;
 const transport=nodemailer.createTransport({host:config.SMTP_HOST,port:config.SMTP_PORT,secure:config.SMTP_PORT===465,auth:config.SMTP_USER?{user:config.SMTP_USER,pass:config.SMTP_PASS}:undefined});
 const pending=await db.notification.findMany({where:{emailSentAt:null,emailAttempts:{lt:5}},include:{user:true},orderBy:{createdAt:'asc'},take:20});
 for(const n of pending){
  const membership=await db.membership.findUnique({where:{workspaceId_userId:{workspaceId:n.workspaceId,userId:n.userId}}});if(!membership?.notificationEmail)continue;
  // SMTP is at-least-once; a stable Message-ID assists provider deduplication.
  await db.notification.update({where:{id:n.id},data:{emailAttempts:{increment:1}}});
  try{await transport.sendMail({from:config.SMTP_FROM,to:n.user.email,subject:n.title,text:`${n.title}. Open your IRMA support workspace for details: ${config.SITE_ORIGIN}`,messageId:`<${n.id}@irma-support>`});await db.notification.update({where:{id:n.id},data:{emailSentAt:new Date()}});}catch(e){logger.warn({notificationId:n.id,error:e.name},'Email delivery failed');}
 }
}

import crypto from 'node:crypto';
import { db,transaction } from './db.js';
import { ApiError,requireThat,canView,staff,manager,transitions,deadline,reference } from './domain.js';

export const ticketInclude={requester:{select:{id:true,name:true,email:true}},assignee:{select:{id:true,name:true}},team:true,cycles:true,_count:{select:{messages:{where:{private:false}}}}};
export function serialize(t){return {...t,reference:reference(t.sequence)};}
export async function visibleTicket(context,id,tx=db){
 const ticket=await tx.ticket.findFirst({where:{id,workspaceId:context.workspace.id},include:ticketInclude});
 requireThat(ticket&&canView(ticket,context.membership,context.user.id),404,'NOT_FOUND','Ticket not found.');return ticket;
}
export async function audit(tx,context,ticketId,action,data={}){
 return tx.audit.create({data:{workspaceId:context.workspace.id,actorId:context.user.id,ticketId,action,data:JSON.parse(JSON.stringify(data))}});
}
export async function notify(tx,context,ticket,type,title,privateEvent=false){
 const watches=await tx.watcher.findMany({where:{ticketId:ticket.id},select:{userId:true}});
 const ids=[...new Set([ticket.requesterId,ticket.assigneeId,...watches.map(x=>x.userId)].filter(Boolean))];
 const permitted=await tx.membership.findMany({where:{workspaceId:ticket.workspaceId,userId:{in:ids}},select:{userId:true,role:true}});
 const recipients=permitted.filter(m=>!privateEvent||staff(m.role));
 for(const m of recipients){
  const n=await tx.notification.create({data:{workspaceId:ticket.workspaceId,userId:m.userId,ticketId:ticket.id,type,title}});
  await tx.outbox.create({data:{workspaceId:ticket.workspaceId,type:'NOTIFICATION',payload:JSON.parse(JSON.stringify({userId:m.userId,notification:n}))}});
 }
 await tx.outbox.create({data:{workspaceId:ticket.workspaceId,type:'TICKET_EVENT',payload:{ticketId:ticket.id,event:type,private:privateEvent,version:ticket.version}}});
}
export async function createTicket(context,input,key){
 requireThat(key&&key.length<=100,400,'IDEMPOTENCY_REQUIRED','A submission key is required.');
 const hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return transaction(async tx=>{
  const saved=await tx.idempotency.findUnique({where:{workspaceId_userId_key:{workspaceId:context.workspace.id,userId:context.user.id,key}}});
  if(saved){requireThat(saved.hash===hash,409,'IDEMPOTENCY_CONFLICT','Submission key was already used with different content.');return serialize(await visibleTicket(context,saved.resultId,tx));}
  requireThat(context.workspace.settings.categories.includes(input.category),422,'INVALID_CATEGORY','Choose a configured category.');
  const now=new Date(),tier=context.membership.tier,settings=context.workspace.settings;
  const policy={...settings,version:context.workspace.version,tier};
  const cycles=[{startedAt:now,dueAt:deadline(now,tier,settings),policy}];
  if(settings.resolutionMinutes)cycles.push({kind:'RESOLUTION',startedAt:now,dueAt:new Date(now.getTime()+settings.resolutionMinutes*60000),policy});
  const ticket=await tx.ticket.create({data:{workspaceId:context.workspace.id,requesterId:context.user.id,...input,tier,cycles:{create:cycles},watchers:{create:{userId:context.user.id}}},include:ticketInclude});
  await tx.idempotency.create({data:{workspaceId:context.workspace.id,userId:context.user.id,key,hash,resultId:ticket.id}});
  await audit(tx,context,ticket.id,'CREATED',{reference:reference(ticket.sequence),tier});
  await notify(tx,context,ticket,'CREATED','New support request');return serialize(ticket);
 });
}
export async function addMessage(context,id,input){
 return transaction(async tx=>{
  const ticket=await visibleTicket(context,id,tx);
  requireThat(!ticket.mergedIntoId&&!ticket.archivedAt,409,'INACTIVE_TICKET','Use the active ticket to reply.');
  requireThat(!['CLOSED','RESOLVED'].includes(ticket.status),409,'REOPEN_REQUIRED','Reopen this ticket before replying.');
  requireThat(!input.private||staff(context.membership.role),403,'FORBIDDEN','Internal notes are restricted to agents.');
  const exists=await tx.message.findUnique({where:{ticketId_authorId_clientId:{ticketId:id,authorId:context.user.id,clientId:input.clientId}}});
  if(exists){requireThat(exists.body===input.body&&exists.private===input.private,409,'IDEMPOTENCY_CONFLICT','Message submission key already used.');return exists;}
  const attachments=await tx.attachment.findMany({where:{id:{in:input.attachmentIds||[]},ticketId:id,uploaderId:context.user.id,messageId:null}});
  requireThat(attachments.length===(input.attachmentIds||[]).length,422,'INVALID_ATTACHMENTS','Attachment unavailable.');
  const msg=await tx.message.create({data:{ticketId:id,authorId:context.user.id,body:input.body,private:input.private,clientId:input.clientId},include:{author:{select:{id:true,name:true}},attachments:true}});
  for(const userId of [...new Set(input.mentionIds||[])]){
   const member=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:ticket.workspaceId,userId}}});
   requireThat(member&&canView(ticket,member,userId)&&(!input.private||staff(member.role)),422,'INVALID_MENTION','Mentioned member is not authorized for this conversation.');
   const n=await tx.notification.create({data:{workspaceId:ticket.workspaceId,userId,ticketId:id,title:input.private?'Mentioned in an internal note':'Mentioned in a support reply',type:'MENTION'}});
   await tx.outbox.create({data:{workspaceId:ticket.workspaceId,type:'NOTIFICATION',payload:JSON.parse(JSON.stringify({userId,notification:n}))}});
  }
  if(attachments.length)await tx.attachment.updateMany({where:{id:{in:attachments.map(x=>x.id)}},data:{messageId:msg.id,private:input.private}});
  if(staff(context.membership.role)&&!input.private){
   await tx.slaCycle.updateMany({where:{ticket:{OR:[{id},{mergedIntoId:id}]},kind:'FIRST_RESPONSE',respondedAt:null},data:{respondedAt:msg.createdAt}});
  }
  await tx.ticket.update({where:{id},data:{version:{increment:1}}});
  await audit(tx,context,id,input.private?'INTERNAL_NOTE':'PUBLIC_REPLY',{messageId:msg.id});
  await notify(tx,context,ticket,'MESSAGE',input.private?'New internal note':'New support reply',input.private);
  return {...msg,attachments};
 });
}
export async function updateTicket(context,id,input){
 return transaction(async tx=>{
  const t=await visibleTicket(context,id,tx),role=context.membership.role;
  requireThat(!t.mergedIntoId,409,'MERGED_TICKET','Update the canonical ticket.');
  requireThat(t.version===input.version,409,'VERSION_CONFLICT','Ticket changed. Refresh and try again.');
  const data={};
  if(input.status&&input.status!==t.status){
   requireThat(transitions[t.status].includes(input.status),422,'INVALID_TRANSITION','This status transition is not allowed.');
   requireThat(staff(role)||input.status==='REOPENED',403,'FORBIDDEN','Only agents can change this status.');
   if(input.status==='RESOLVED'){
    requireThat(input.resolution?.trim(),422,'RESOLUTION_REQUIRED','A resolution summary is required.');
    data.resolution=input.resolution;data.resolvedAt=new Date();
    await tx.slaCycle.updateMany({where:{ticket:{OR:[{id},{mergedIntoId:id}]},kind:'RESOLUTION',respondedAt:null},data:{respondedAt:new Date()}});
   }
   if(input.status==='REOPENED'){
    requireThat(t.requesterId===context.user.id||staff(role),403,'FORBIDDEN','Only the requester or an agent can reopen.');
    const now=new Date();data.resolvedAt=null;
    await tx.slaCycle.create({data:{ticketId:id,startedAt:now,dueAt:deadline(now,t.tier,context.workspace.settings),policy:{...context.workspace.settings,version:context.workspace.version,tier:t.tier}}});
    if(context.workspace.settings.resolutionMinutes)await tx.slaCycle.create({data:{ticketId:id,kind:'RESOLUTION',startedAt:now,dueAt:new Date(now.getTime()+context.workspace.settings.resolutionMinutes*60000),policy:context.workspace.settings}});
   }
   if(input.status==='WAITING_CUSTOMER'&&context.workspace.settings.pauseResolutionOnWaitingCustomer){
    const resolution=await tx.slaCycle.findMany({where:{ticketId:id,kind:'RESOLUTION',respondedAt:null,pausedAt:null}});
    for(const c of resolution)await tx.slaCycle.update({where:{id:c.id},data:{pausedAt:new Date(),remainingMinutes:Math.max(0,(c.dueAt.getTime()-Date.now())/60000)}});
   }else{
    const paused=await tx.slaCycle.findMany({where:{ticketId:id,kind:'RESOLUTION',respondedAt:null,pausedAt:{not:null}}});
    for(const c of paused)await tx.slaCycle.update({where:{id:c.id},data:{pausedAt:null,dueAt:new Date(Date.now()+(c.remainingMinutes||0)*60000),remainingMinutes:null}});
   }
   data.status=input.status;
  }
  for(const k of ['subject','description','category','urgency','tags','relatedIds'])if(input[k]!==undefined){
   requireThat(staff(role)||(t.requesterId===context.user.id&&['OPEN','REOPENED'].includes(t.status)&&['subject','description','category','urgency'].includes(k)),403,'FORBIDDEN','You cannot edit this field.');
   if(k==='category')requireThat(context.workspace.settings.categories.includes(input[k]),422,'INVALID_CATEGORY','Choose a configured category.');
   if(k==='relatedIds')for(const relatedId of input[k])await visibleTicket(context,relatedId,tx);
   data[k]=input[k];
  }
  if(input.assigneeId!==undefined){
   requireThat(manager(role)||(staff(role)&&(!t.assigneeId||t.assigneeId===context.user.id)&&(!input.assigneeId||input.assigneeId===context.user.id)),403,'FORBIDDEN','Supervisor access is required to assign another agent.');
   if(input.assigneeId){const m=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:t.workspaceId,userId:input.assigneeId}}});requireThat(m&&staff(m.role),422,'INVALID_AGENT','Choose an agent in this workspace.');}
   data.assigneeId=input.assigneeId;
  }
  if(input.teamId!==undefined){requireThat(manager(role),403,'FORBIDDEN','Supervisor access required.');if(input.teamId)requireThat(await tx.team.findFirst({where:{id:input.teamId,workspaceId:t.workspaceId}}),422,'INVALID_TEAM','Team unavailable.');data.teamId=input.teamId;}
  if(input.archived!==undefined){requireThat(manager(role),403,'FORBIDDEN','Supervisor access required.');data.archivedAt=input.archived?new Date():null;}
  const changed=await tx.ticket.updateMany({where:{id,version:input.version},data:{...data,version:{increment:1}}});
  requireThat(changed.count===1,409,'VERSION_CONFLICT','Ticket changed. Refresh and retry.');
  await audit(tx,context,id,'UPDATED',data);
  const result=await tx.ticket.findUnique({where:{id},include:ticketInclude});await notify(tx,context,result,'UPDATED','Support request updated');return serialize(result);
 });
}
export async function mergeTicket(context,id,targetId){
 requireThat(manager(context.membership.role),403,'FORBIDDEN','Supervisor access required.');
 requireThat(id!==targetId,422,'INVALID_MERGE','Choose another ticket.');
 return transaction(async tx=>{
  const source=await visibleTicket(context,id,tx),target=await visibleTicket(context,targetId,tx);
  requireThat(!source.mergedIntoId&&!target.mergedIntoId&&source.requesterId===target.requesterId&&!target.archivedAt&&!['RESOLVED','CLOSED'].includes(target.status),422,'INVALID_MERGE','Merge active tickets from the same requester.');
  await tx.ticket.update({where:{id},data:{mergedIntoId:targetId,archivedAt:new Date(),version:{increment:1}}});
  await tx.ticket.updateMany({where:{mergedIntoId:id,workspaceId:source.workspaceId},data:{mergedIntoId:targetId}});
  await audit(tx,context,id,'MERGED',{targetId});await audit(tx,context,targetId,'MERGE_RECEIVED',{sourceId:id});
  await notify(tx,context,target,'MERGED','Related support request merged');return {targetId};
 });
}

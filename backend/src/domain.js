import { DateTime } from 'luxon';
import crypto from 'node:crypto';
export const staff = role => ['AGENT','SUPERVISOR','ADMIN'].includes(role);
export const manager = role => ['SUPERVISOR','ADMIN'].includes(role);
export const transitions = {
 OPEN:['IN_PROGRESS','WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED'],
 IN_PROGRESS:['WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED'],
 WAITING_CUSTOMER:['IN_PROGRESS','WAITING_INTERNAL','RESOLVED'],
 WAITING_INTERNAL:['IN_PROGRESS','WAITING_CUSTOMER','RESOLVED'],
 RESOLVED:['CLOSED','REOPENED'], CLOSED:['REOPENED'], REOPENED:['IN_PROGRESS','WAITING_CUSTOMER','WAITING_INTERNAL','RESOLVED']
};
export class ApiError extends Error { constructor(status,code,message){ super(message); this.status=status; this.code=code; } }
export function requireThat(condition,status,code,message){if(!condition)throw new ApiError(status,code,message);}
export function sign(payload,secret){ const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'); return encoded+'.'+crypto.createHmac('sha256',secret).update(encoded).digest('base64url'); }
export function verify(token,secret,audience){
 const [body,signature,...extra]=(token??'').split('.');
 requireThat(body&&signature&&!extra.length,401,'UNAUTHENTICATED','Sign in to continue.');
 const actual=Buffer.from(signature); const expected=Buffer.from(crypto.createHmac('sha256',secret).update(body).digest('base64url'));
 requireThat(actual.length===expected.length&&crypto.timingSafeEqual(actual,expected),401,'UNAUTHENTICATED','Invalid session.');
 let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw new ApiError(401,'UNAUTHENTICATED','Invalid session.');}
 const now=Math.floor(Date.now()/1000);
 requireThat(value.aud===audience&&value.exp>now&&value.iat<=now+10&&value.exp-value.iat<=300&&typeof value.sub==='string',401,'UNAUTHENTICATED','Session expired.');return value;
}
export function deadline(start,tier,settings,minutes=settings.firstResponseMinutes[tier]){
 if(['ELITE','PRIORITY'].includes(tier))return new Date(start.getTime()+minutes*60000);
 const c=settings.calendar;let cursor=DateTime.fromJSDate(start,{zone:c.zone});let remaining=minutes;
 requireThat(cursor.isValid&&c.days.length>0,422,'INVALID_CALENDAR','A valid business calendar is required.');
 const [oh,om]=c.open.split(':').map(Number);const [ch,cm]=c.close.split(':').map(Number);
 requireThat(ch*60+cm>oh*60+om,422,'INVALID_CALENDAR','Closing time must be after opening time.');
 for(let i=0;i<3700;i++){
  const holiday=c.holidays.includes(cursor.toISODate());
  const open=cursor.startOf('day').set({hour:oh,minute:om});const close=cursor.startOf('day').set({hour:ch,minute:cm});
  if(c.days.includes(cursor.weekday)&&!holiday){
   if(cursor<open)cursor=open;
   const available=Math.max(0,close.diff(cursor,'minutes').minutes);
   if(available>=remaining)return cursor.plus({minutes:remaining}).toUTC().toJSDate();
   remaining-=available;
  }
  cursor=cursor.plus({days:1}).startOf('day');
 }
 throw new ApiError(422,'INVALID_CALENDAR','Calendar cannot produce a deadline.');
}
export function canView(ticket,membership,userId){return Boolean(ticket.workspaceId===membership.workspaceId&&(staff(membership.role)||ticket.requesterId===userId||membership.organizationAccess));}
export function queueScore(ticket,now,agingMinutes){
 const cycle=ticket.cycles.find(c=>!c.respondedAt&&c.kind==='FIRST_RESPONSE');
 const due=cycle?.dueAt?new Date(cycle.dueAt).getTime():Infinity;
 const aged=now-new Date(ticket.createdAt).getTime()>=agingMinutes*60000;
 const rank={ELITE:0,PRIORITY:1,GROWTH:2,ESSENTIAL:3}[ticket.tier];
 return [due<=now+5*60000?0:aged?1:2,rank,due,new Date(ticket.createdAt).getTime(),ticket.id];
}
export function compareQueue(a,b,now,agingMinutes){const x=queueScore(a,now,agingMinutes),y=queueScore(b,now,agingMinutes);for(let i=0;i<x.length;i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}return 0;}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export const reference = sequence => `IR-${String(sequence).padStart(5,'0')}`;

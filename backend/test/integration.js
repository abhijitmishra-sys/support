import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const store=await PGlite.create();
await store.exec(await fs.readFile(new URL('../prisma/migrations/202610060001_initial/migration.sql',import.meta.url),'utf8'));
await store.exec(await fs.readFile(new URL('../prisma/migrations/202610060002_password_auth/migration.sql',import.meta.url),'utf8'));
process.env.ENABLE_PASSWORD_AUTH='true';
const pgServer=new PGLiteSocketServer({db:store,port:55432,host:'127.0.0.1'});await pgServer.start();
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable',GATEWAY_SECRET:'integration-gateway-secret-minimum-32-characters',SOCKET_SECRET:'integration-socket-secret-minimum-32-characters',SITE_ORIGIN:'http://localhost:3000',SOCKET_PUBLIC_URL:'http://localhost:4100',DEFAULT_WORKSPACE_ID:'irma',UPLOAD_DIRECTORY:'./.test-db/uploads'});
const { db }=await import('../src/db.js');const { defaultSettings }=await import('../src/config.js');const { sign }=await import('../src/domain.js');const { startServer }=await import('../src/server.js');const { slaSweep }=await import('../src/jobs.js');
const settings={...defaultSettings,configured:true};
await db.workspace.create({data:{id:'irma',name:'Integration test workspace',settings}});await db.workspace.create({data:{id:'other',name:'Other tenant',settings}});
const ids={};for(const [sub,role,tier,workspaceId] of [['customer','CUSTOMER','GROWTH','irma'],['stranger','CUSTOMER','ESSENTIAL','irma'],['agent','AGENT','PRIORITY','irma'],['admin','ADMIN','ELITE','irma'],['outsider','ADMIN','ELITE','other']]){const user=await db.user.create({data:{externalId:sub,email:sub+'@example.test',name:sub}});ids[sub]=user.id;await db.membership.create({data:{workspaceId,userId:user.id,role,tier}});}
const service=await startServer(0),base='http://127.0.0.1:'+service.server.address().port;
let checks=0;
async function request(sub,path,method='GET',body,expected=200,key){const now=Math.floor(Date.now()/1000);const headers={'content-type':'application/json','x-irma-identity':sign({sub,email:sub+'@example.test',name:sub,iat:now,exp:now+60,aud:'irma-api'},process.env.GATEWAY_SECRET),'x-irma-workspace':sub==='outsider'?'other':'irma'};if(key)headers['idempotency-key']=key;const res=await fetch(base+'/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const value=await res.json();assert.equal(res.status,expected,JSON.stringify(value));checks++;return value.data;}
try{
 const { hashPassword,sessionHash }=await import('../src/passwords.js');
 const credentials={email:'password-customer@example.test',password:'A strong integration password'};
 async function authRequest(path,body,expected=200,token){
  const response=await fetch(base+'/auth/'+path,{method:path==='session'?'GET':'POST',headers:{'content-type':'application/json','x-irma-auth-gateway':process.env.GATEWAY_SECRET,...(token?{'x-irma-session':token}:{})},...(path==='session'?{}:{body:JSON.stringify(body||{})})});
  const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));checks++;return result.data;
 }
 async function sessionRequest(token,path,expected){const response=await fetch(base+'/v1/'+path,{headers:{'x-irma-session':token}});assert.equal(response.status,expected);checks++;return response.json();}
 await authRequest('register',{...credentials,name:'Customer',role:'ADMIN'},422);
 const registered=await authRequest('register',{...credentials,name:'Customer'},201);
 const persisted=await db.passwordCredential.findUnique({where:{email:credentials.email}});assert.ok(persisted.passwordHash.startsWith('scrypt$'));assert.notEqual(persisted.passwordHash,credentials.password);
 const registeredSession=await authRequest('session',null,200,registered.token);assert.equal(registeredSession.role,'CUSTOMER');
 await authRequest('register',{...credentials,name:'Customer'},409);
 await authRequest('login',{...credentials,password:'Wrong password',portal:'customer'},401);
 await authRequest('login',{...credentials,email:'missing@example.test',portal:'customer'},401);
 await authRequest('login',{...credentials,portal:'staff'},403);
 const login=await authRequest('login',{...credentials,email:credentials.email.toUpperCase(),portal:'customer'});
 await sessionRequest(login.token,'me',200);await sessionRequest(login.token,'admin',403);
 await sessionRequest('a'.repeat(64),'me',401);
 await db.passwordCredential.create({data:{userId:ids.admin,email:'password-admin@example.test',passwordHash:await hashPassword(credentials.password)}});
 const adminLogin=await authRequest('login',{email:'password-admin@example.test',password:credentials.password,portal:'staff'});
 await sessionRequest(adminLogin.token,'admin',200);
 await authRequest('login',{email:'password-admin@example.test',password:credentials.password,portal:'customer'},403);
 await authRequest('logout',{},200,login.token);await sessionRequest(login.token,'me',401);
 await db.authSession.update({where:{tokenHash:sessionHash(registered.token)},data:{expiresAt:new Date(Date.now()-1000)}});
 await authRequest('session',null,401,registered.token);
 await db.membership.update({where:{workspaceId_userId:{workspaceId:'irma',userId:ids.admin}},data:{role:'CUSTOMER'}});
 await sessionRequest(adminLogin.token,'admin',403);
 await db.membership.update({where:{workspaceId_userId:{workspaceId:'irma',userId:ids.admin}},data:{role:'ADMIN'}});
 const missingGateway=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...credentials,portal:'customer'})});assert.equal(missingGateway.status,401);checks++;
 await request('customer','admin','GET',undefined,403);
 const input={subject:'Persisted integration request',description:'Steps to reproduce the integration issue.',category:'Integration',urgency:'HIGH'};
 const ticket=await request('customer','tickets','POST',input,201,'test-create-key');assert.match(ticket.reference,/^IR-\d{5}$/);assert.equal(ticket.tier,'GROWTH');assert.equal(ticket.assigneeId,null);
 const duplicate=await request('customer','tickets','POST',input,201,'test-create-key');assert.equal(duplicate.id,ticket.id);
 await request('customer','tickets','POST',{...input,subject:'Different payload'},409,'test-create-key');
 await request('stranger','tickets/'+ticket.id,'GET',undefined,404);await request('outsider','tickets/'+ticket.id,'GET',undefined,404);
 await request('customer','tickets/'+ticket.id+'/messages','POST',{body:'Trying to add an internal note',private:true,clientId:'private-denied'},403);
 await request('agent','availability','PATCH',{available:true});const assigned=await request('customer','tickets/'+ticket.id);assert.equal(assigned.ticket.assigneeId,ids.agent);assert.equal(assigned.ticket.status,'IN_PROGRESS');
 await request('agent','tickets/'+ticket.id+'/messages','POST',{body:'Confidential engineering note',private:true,clientId:'private-note-key'},201);
 const publicView=await request('customer','tickets/'+ticket.id);assert.equal(publicView.messages.length,0);assert.equal(publicView.ticket.cycles[0].respondedAt,null);
 const message=await request('agent','tickets/'+ticket.id+'/messages','POST',{body:'I am investigating your integration request.',private:false,clientId:'public-reply-key'},201);
 const repeated=await request('agent','tickets/'+ticket.id+'/messages','POST',{body:'I am investigating your integration request.',private:false,clientId:'public-reply-key'},201);assert.equal(repeated.id,message.id);
 const replied=await request('customer','tickets/'+ticket.id);assert.equal(replied.messages.length,1);assert.ok(replied.ticket.cycles[0].respondedAt);
 await request('agent','tickets/'+ticket.id,'PATCH',{version:1,status:'RESOLVED',resolution:'Fixed.'},409);
 await request('agent','tickets/'+ticket.id,'PATCH',{version:replied.ticket.version,status:'RESOLVED'},422);
 const resolved=await request('agent','tickets/'+ticket.id,'PATCH',{version:replied.ticket.version,status:'RESOLVED',resolution:'The integration configuration was corrected.'});
 await request('customer','tickets/'+ticket.id+'/feedback','POST',{rating:5});
 const reopened=await request('customer','tickets/'+ticket.id,'PATCH',{version:resolved.version,status:'REOPENED'});assert.equal(reopened.cycles.length,2);
 const file=await request('customer','tickets/'+ticket.id+'/attachments','POST',{fileName:'repro.txt',mime:'text/plain',data:Buffer.from('Reproduction instructions').toString('base64')},201);assert.equal(file.scanStatus,'UNSCANNED');
 await request('customer','tickets/'+ticket.id+'/attachments','POST',{fileName:'bad.html',mime:'text/html',data:Buffer.from('<script>alert(1)</script>').toString('base64')},415);
 await request('customer','tickets/'+ticket.id+'/messages','POST',{body:'Here are the requested details.',clientId:'customer-reply-key',attachmentIds:[file.id]},201);
 const t2=await request('customer','tickets','POST',{...input,subject:'Duplicate integration issue'},201,'test-second-key');
 await request('admin','tickets/'+t2.id+'/merge','POST',{targetId:ticket.id});
 const pending=await db.slaCycle.findFirst({where:{ticketId:ticket.id,respondedAt:null}});await db.slaCycle.update({where:{id:pending.id},data:{dueAt:new Date(Date.now()-60000)}});await slaSweep();const breached=await db.slaCycle.findUnique({where:{id:pending.id}});assert.ok(breached.breachedAt);const before=await db.notification.count({where:{type:'SLA_BREACH'}});await slaSweep();assert.equal(await db.notification.count({where:{type:'SLA_BREACH'}}),before);
 const report=await request('admin','reports');assert.equal(report.volume,2);assert.equal(report.satisfaction,5);
 const list=await request('customer','tickets?page=1&limit=1');assert.equal(list.items.length,1);assert.equal(list.total,1);
 await request('admin','articles','POST',{title:'Internal article',body:'Staff-only troubleshooting steps.',category:'Integration',published:false},201);assert.equal((await request('customer','articles')).length,0);
 await request('customer','tickets/'+ticket.id+'/messages','POST',{body:'Wrong mention',clientId:'wrong-mention-key',mentionIds:[ids.stranger]},422);
 await request('customer','socket-session','POST');
 console.log(JSON.stringify({passed:true,apiChecks:checks,database:'Real PostgreSQL engine through PGlite TCP (development verification)',limits:'Native PostgreSQL multi-connection concurrency, Redis multi-instance, production hosting, SMTP, and browser E2E require deployment infrastructure.'}));
}finally{await service.close();await pgServer.stop();await store.close();await fs.rm('./.test-db',{recursive:true,force:true});}

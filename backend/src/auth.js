import { db } from './db.js';
import { config,defaultSettings } from './config.js';
import { verify,requireThat,staff,manager } from './domain.js';
import { sessionContext } from './password-auth.js';
export async function authenticate(req,res,next){
 try{
  if(req.headers['x-irma-session']){
   requireThat(config.ENABLE_PASSWORD_AUTH==='true',401,'UNAUTHENTICATED','Password sign-in is not enabled.');
   req.context=await sessionContext(req.headers['x-irma-session']);next();return;
  }
  const identity=verify(req.headers['x-irma-identity'],config.GATEWAY_SECRET,'irma-api');
  const user=await db.user.upsert({where:{externalId:identity.sub},create:{externalId:identity.sub,email:identity.email,name:identity.name||identity.email},update:{email:identity.email,name:identity.name||identity.email}});
  const workspaceId=String(req.headers['x-irma-workspace']||config.DEFAULT_WORKSPACE_ID);
  let membership=await db.membership.findUnique({where:{workspaceId_userId:{workspaceId,userId:user.id}},include:{workspace:true}});
  if(!membership&&identity.sub===config.BOOTSTRAP_ADMIN_SUB&&workspaceId===config.DEFAULT_WORKSPACE_ID){
   await db.workspace.upsert({where:{id:workspaceId},create:{id:workspaceId,name:'IRMA Workspace',settings:defaultSettings},update:{}});
   membership=await db.membership.upsert({where:{workspaceId_userId:{workspaceId,userId:user.id}},create:{workspaceId,userId:user.id,role:'ADMIN',tier:'ELITE'},update:{},include:{workspace:true}});
  }else if(!membership&&config.ALLOW_CUSTOMER_SIGNUP==='true'&&workspaceId===config.DEFAULT_WORKSPACE_ID){
   requireThat(await db.workspace.findUnique({where:{id:workspaceId}}),403,'WORKSPACE_UNAVAILABLE','Workspace not configured.');
   membership=await db.membership.create({data:{workspaceId,userId:user.id},include:{workspace:true}});
  }
  requireThat(membership,403,'MEMBERSHIP_REQUIRED','Ask your workspace administrator for access.');
  req.context={user,membership,workspace:membership.workspace};next();
 }catch(e){next(e);}
}
export const onlyStaff=(req,res,next)=>staff(req.context.membership.role)?next():next(Object.assign(new Error('Agent access required.'),{status:403,code:'FORBIDDEN'}));
export const onlyManager=(req,res,next)=>manager(req.context.membership.role)?next():next(Object.assign(new Error('Supervisor access required.'),{status:403,code:'FORBIDDEN'}));
export const onlyAdmin=(req,res,next)=>req.context.membership.role==='ADMIN'?next():next(Object.assign(new Error('Administrator access required.'),{status:403,code:'FORBIDDEN'}));

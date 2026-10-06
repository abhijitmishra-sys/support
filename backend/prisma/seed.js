import { db } from '../src/db.js';
import { config,defaultSettings } from '../src/config.js';
if(config.NODE_ENV==='production')throw new Error('Development seed is disabled in production.');
const workspace=await db.workspace.upsert({where:{id:'irma'},create:{id:'irma',name:'IRMA Development Workspace',settings:{...defaultSettings,configured:true}},update:{}});
for(const [externalId,name,role,tier] of [['dev-admin','Workspace Admin','ADMIN','ELITE'],['dev-agent','Support Agent','AGENT','PRIORITY'],['dev-customer','Test Customer','CUSTOMER','GROWTH']]){
 const user=await db.user.upsert({where:{externalId},create:{externalId,email:externalId+'@example.test',name},update:{}});
 await db.membership.upsert({where:{workspaceId_userId:{workspaceId:workspace.id,userId:user.id}},create:{workspaceId:workspace.id,userId:user.id,role,tier},update:{}});
}
await db.cannedResponse.createMany({data:[{workspaceId:'irma',title:'Investigating your request',body:'Thank you for the details. I am reviewing your request and will share the next steps here.'}],skipDuplicates:true});
await db.article.create({data:{workspaceId:'irma',title:'How to create a useful support request',category:'Getting started',body:'Describe what you expected, what happened, and the steps to reproduce it. Include relevant screenshots without passwords or access tokens.',published:true}});
console.log('Development workspace seeded. No production identities were created.');await db.$disconnect();

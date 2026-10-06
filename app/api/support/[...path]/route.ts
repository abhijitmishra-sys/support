import { runtimeEnv } from '@/lib/runtime-env';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { passwordLoginEnabled, passwordSessionToken } from '@/app/password-session';
export const dynamic='force-dynamic';
const failure=(status:number,code:string,message:string)=>Response.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const runtime=runtimeEnv();const user=await getChatGPTUser();
 const {path}=await params;
 if(path.join('/')==='status')return Response.json({data:{configured:!!runtime.BACKEND_URL&&!!runtime.GATEWAY_SECRET,signedIn:!!user}},{headers:{'Cache-Control':'no-store'}});
 if(!user)return failure(401,'SIGN_IN_REQUIRED','Sign in to access your support workspace.');
 if(!runtime.BACKEND_URL||!runtime.GATEWAY_SECRET)return failure(503,'BACKEND_NOT_CONNECTED','The support service has not been connected yet. Requests cannot be saved until the backend is deployed.');
 const backendUrl=new URL(runtime.BACKEND_URL);
 const localDevelopment=process.env.NODE_ENV==='development'&&backendUrl.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(backendUrl.hostname);
 if(backendUrl.protocol!=='https:'&&!localDevelopment)return failure(503,'INVALID_BACKEND_CONFIG','Backend configuration requires HTTPS.');
 if(!['GET','POST','PATCH'].includes(request.method))return failure(405,'METHOD_NOT_ALLOWED','Method not allowed.');
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)return failure(403,'INVALID_ORIGIN','Request origin is not permitted.');
 const allowed=['me','tickets','attachments','notifications','preferences','team','availability','heartbeat','articles','canned','reports','export','admin','socket-session'];
 if(!allowed.includes(path[0]))return failure(404,'NOT_FOUND','Endpoint not found.');
 if(Number(request.headers.get('content-length')||0)>8*1024*1024)return failure(413,'BODY_TOO_LARGE','Request is too large.');
 const iat=Math.floor(Date.now()/1000);const claims={sub:user.userId,email:user.email,name:user.displayName,iat,exp:iat+60,aud:'irma-api'};
 const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(claims)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(runtime.GATEWAY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(encoded)));
 const signature=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const url=new URL('/v1/'+path.map(encodeURIComponent).join('/'),runtime.BACKEND_URL);url.search=new URL(request.url).search;
 const headers:Record<string,string>={'x-irma-identity':encoded+'.'+signature,'x-irma-workspace':runtime.WORKSPACE_ID||'irma'};
 if(passwordLoginEnabled()){
  const token=await passwordSessionToken();
  if(!token)return failure(401,'SIGN_IN_REQUIRED','Sign in to access your support workspace.');
  delete headers['x-irma-identity'];headers['x-irma-session']=token;
 }
 for(const name of ['content-type','idempotency-key']){const value=request.headers.get(name);if(value)headers[name]=value;}
 let body:ArrayBuffer|undefined;if(request.method!=='GET'){body=await request.arrayBuffer();if(body.byteLength>8*1024*1024)return failure(413,'BODY_TOO_LARGE','Request is too large.');}
 try{
  const response=await fetch(url,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.status>=300&&response.status<400)return failure(502,'UNEXPECTED_BACKEND_REDIRECT','The support service returned an unexpected redirect.');
  const returned=new Headers({'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const name of ['content-disposition','x-request-id']){const value=response.headers.get(name);if(value)returned.set(name,value);}
  return new Response(response.body,{status:response.status,headers:returned});
 }catch(error){console.error('Support gateway request failed',error instanceof Error?error.message:'Unknown error');return failure(503,'BACKEND_UNAVAILABLE','The support service is temporarily unreachable. Please try again.');}
}
export const GET=proxy;export const POST=proxy;export const PATCH=proxy;

import SupportApp from './support-app';
import { getChatGPTUser } from './chatgpt-auth';
import { passwordLoginEnabled } from './password-session';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Home(){const identity=await getChatGPTUser();const passwordAuth=passwordLoginEnabled();if(passwordAuth&&!identity)redirect('/login');return <SupportApp identity={identity} passwordAuth={passwordAuth}/>;}

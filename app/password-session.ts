import { runtimeEnv } from '@/lib/runtime-env';
import { cookies } from 'next/headers';

export const sessionCookie = 'irma_session';
export function passwordLoginEnabled() {
 return runtimeEnv().AUTH_MODE === 'password';
}
export async function passwordSessionToken() {
 return (await cookies()).get(sessionCookie)?.value;
}
export function backendRuntime() {
 const runtime = runtimeEnv();
 if (!runtime.BACKEND_URL || !runtime.GATEWAY_SECRET) throw new Error('Support service is not configured.');
 const url = new URL(runtime.BACKEND_URL);
 const local = process.env.NODE_ENV === 'development' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
 if (url.protocol !== 'https:' && !local) throw new Error('The support service requires HTTPS.');
 return { ...runtime, BACKEND_URL: runtime.BACKEND_URL, GATEWAY_SECRET: runtime.GATEWAY_SECRET };
}
export async function authRequest(path: string, init: RequestInit = {}) {
 const runtime = backendRuntime();
 const token = await passwordSessionToken();
 return fetch(new URL('/auth/' + path, runtime.BACKEND_URL), {
  ...init, redirect: 'manual', signal: AbortSignal.timeout(20000),
  headers: { 'content-type': 'application/json', 'x-irma-auth-gateway': runtime.GATEWAY_SECRET, ...(token ? { 'x-irma-session': token } : {}) },
 });
}

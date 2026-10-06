import { authRequest, passwordLoginEnabled, sessionCookie } from '@/app/password-session';
export const dynamic = 'force-dynamic';
const failure = (status: number, message: string) => Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
 if (!passwordLoginEnabled()) return failure(404, 'Password sign-in is not enabled.');
 if (request.headers.get('origin') !== new URL(request.url).origin) return failure(403, 'Request origin is not permitted.');
 const { action } = await params;
 if (!['login', 'register', 'logout'].includes(action)) return failure(404, 'Endpoint not found.');
 if (Number(request.headers.get('content-length') || 0) > 4096) return failure(413, 'Request is too large.');
 const body = await request.text();
 if (new TextEncoder().encode(body).byteLength > 4096) return failure(413, 'Request is too large.');
 try {
  const response = await authRequest(action, { method: 'POST', body: body || '{}' });
  if (response.status >= 300 && response.status < 400) return failure(502, 'Unexpected service redirect.');
  const result = await response.json() as { data?: { token?: string; maxAge?: number }; error?: { message?: string } };
  if (!response.ok) return Response.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const cookie = action === 'logout'
   ? `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
   : `${sessionCookie}=${result.data?.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${result.data?.maxAge}${secure}`;
  return Response.json({ data: { success: true } }, { status: response.status, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie } });
 } catch { return failure(503, 'The support service is unavailable. Please try again.'); }
}

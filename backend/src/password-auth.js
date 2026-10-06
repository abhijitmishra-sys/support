import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { requireThat, staff } from './domain.js';
import { hashPassword, verifyPassword, sessionHash } from './passwords.js';

const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128);
const sessionSeconds = 12 * 60 * 60;
// Match password work for unknown accounts to avoid a fast account-enumeration path.
const dummyPassword = hashPassword(randomBytes(32).toString('hex'));
export async function sessionContext(token) {
 requireThat(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 401, 'UNAUTHENTICATED', 'Sign in to continue.');
 const session = await db.authSession.findUnique({ where: { tokenHash: sessionHash(token) }, include: { user: true } });
 requireThat(session && session.expiresAt > new Date(), 401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
 const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: config.DEFAULT_WORKSPACE_ID, userId: session.userId } }, include: { workspace: true } });
 requireThat(membership, 403, 'MEMBERSHIP_REQUIRED', 'Workspace access is required.');
 return { user: session.user, membership, workspace: membership.workspace, sessionHash: session.tokenHash };
}
function publicUser(context) {
 return { userId: context.user.externalId, displayName: context.user.name, email: context.user.email, fullName: context.user.name, role: context.membership.role };
}
async function issueSession(userId) {
 const token = randomBytes(32).toString('hex');
 await db.authSession.create({ data: { tokenHash: sessionHash(token), userId, expiresAt: new Date(Date.now() + sessionSeconds * 1000) } });
 return { token, maxAge: sessionSeconds };
}
export function passwordAuthRouter() {
 const router = Router();
 router.use((req, res, next) => {
  try {
   requireThat(config.ENABLE_PASSWORD_AUTH === 'true', 404, 'NOT_FOUND', 'Password sign-in is not enabled.');
   const actual = Buffer.from(String(req.headers['x-irma-auth-gateway'] || ''));
   const expected = Buffer.from(config.GATEWAY_SECRET);
   requireThat(actual.length === expected.length && timingSafeEqual(actual, expected), 401, 'UNAUTHENTICATED', 'Use the application sign-in page.');
   next();
  } catch (error) { next(error); }
 });
 const attempts = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } } });
 router.post('/login', attempts, async (req, res) => {
  const input = z.object({ email: emailSchema, password: z.string().min(1).max(128), portal: z.enum(['customer', 'staff']) }).strict().parse(req.body);
  const credential = await db.passwordCredential.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, credential?.passwordHash || await dummyPassword);
  requireThat(credential && valid, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: config.DEFAULT_WORKSPACE_ID, userId: credential.userId } } });
  requireThat(membership && (input.portal === 'staff' ? staff(membership.role) : membership.role === 'CUSTOMER'), 403, 'WRONG_PORTAL', 'This account cannot access this portal. Use the other sign-in page.');
  res.json({ data: await issueSession(credential.userId) });
 });
 router.post('/register', attempts, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(100), email: emailSchema, password: passwordSchema }).strict().parse(req.body);
  requireThat(await db.workspace.findUnique({ where: { id: config.DEFAULT_WORKSPACE_ID } }), 503, 'WORKSPACE_UNAVAILABLE', 'The support workspace is not configured.');
  const passwordHash = await hashPassword(input.password);
  let user;
  try {
   user = await db.user.create({ data: { externalId: 'password:' + randomUUID(), email: input.email, name: input.name, passwordCredential: { create: { email: input.email, passwordHash } }, memberships: { create: { workspaceId: config.DEFAULT_WORKSPACE_ID, role: 'CUSTOMER', tier: 'ESSENTIAL' } } } });
  } catch (error) {
   if (error.code === 'P2002') return res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists. Please sign in.' } });
   throw error;
  }
  res.status(201).json({ data: await issueSession(user.id) });
 });
 router.get('/session', async (req, res) => res.json({ data: publicUser(await sessionContext(req.headers['x-irma-session'])) }));
 router.post('/logout', async (req, res) => {
  const token = req.headers['x-irma-session'];
  if (typeof token === 'string') {
   await db.$transaction(async tx => {
    const session = await tx.authSession.findUnique({ where: { tokenHash: sessionHash(token) } });
    if (!session) return;
    await tx.authSession.delete({ where: { tokenHash: session.tokenHash } });
    await tx.outbox.create({ data: { workspaceId: config.DEFAULT_WORKSPACE_ID, type: 'ACCESS_CHANGED', payload: { userId: session.userId } } });
   });
  }
  res.json({ data: { signedOut: true } });
 });
 return router;
}

// Local development only: creates two password accounts without modifying existing users.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { db } from '../src/db.js';
import { config, defaultSettings } from '../src/config.js';
import { hashPassword } from '../src/passwords.js';
if (config.NODE_ENV !== 'development') throw new Error('Local accounts are only allowed in development.');
const file = new URL('../../.sites-runtime/local-accounts.json', import.meta.url);
try { await access(file); throw new Error('Local account credentials already exist; refusing to overwrite.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const accounts = [];
try {
 await db.workspace.upsert({ where: { id: config.DEFAULT_WORKSPACE_ID }, create: { id: config.DEFAULT_WORKSPACE_ID, name: 'IRMA Workspace', settings: defaultSettings }, update: {} });
 for (const [email, name, role, tier] of [['customer@irma.test', 'Test Customer', 'CUSTOMER', 'ESSENTIAL'], ['admin@irma.test', 'Support Admin', 'ADMIN', 'ELITE']]) {
  if (await db.passwordCredential.findUnique({ where: { email } })) throw new Error('Account already exists; refusing to reset its password: ' + email);
  const password = randomBytes(15).toString('base64url');
  const passwordHash = await hashPassword(password);
  await db.user.create({ data: { externalId: 'password:' + randomUUID(), email, name, passwordCredential: { create: { email, passwordHash } }, memberships: { create: { workspaceId: config.DEFAULT_WORKSPACE_ID, role, tier } } } });
  accounts.push({ email, password, role });
 }
 await mkdir(new URL('../../.sites-runtime/', import.meta.url), { recursive: true });
 await writeFile(file, JSON.stringify(accounts, null, 2));
 console.log('Created customer and admin accounts. Credentials saved in .sites-runtime/local-accounts.json.');
} finally { await db.$disconnect(); }

// One-time provisioning through the hosting provider's private environment.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../src/db.js';
import { config, defaultSettings } from '../src/config.js';
import { hashPassword } from '../src/passwords.js';
const input = z.object({
 PROVISION_ADMIN_EMAIL: z.string().trim().email().transform(value => value.toLowerCase()),
 PROVISION_ADMIN_NAME: z.string().trim().min(2).max(100),
 PROVISION_ADMIN_PASSWORD: z.string().min(12).max(128),
}).parse(process.env);
try {
 const passwordHash = await hashPassword(input.PROVISION_ADMIN_PASSWORD);
 await db.$transaction(async tx => {
  if (await tx.passwordCredential.findUnique({ where: { email: input.PROVISION_ADMIN_EMAIL } })) throw new Error('This email already has a password account. No changes made.');
  await tx.workspace.upsert({ where: { id: config.DEFAULT_WORKSPACE_ID }, create: { id: config.DEFAULT_WORKSPACE_ID, name: 'IRMA Workspace', settings: defaultSettings }, update: {} });
  await tx.user.create({ data: { externalId: 'password:' + randomUUID(), email: input.PROVISION_ADMIN_EMAIL, name: input.PROVISION_ADMIN_NAME, passwordCredential: { create: { email: input.PROVISION_ADMIN_EMAIL, passwordHash } }, memberships: { create: { workspaceId: config.DEFAULT_WORKSPACE_ID, role: 'ADMIN', tier: 'ELITE' } } } });
 });
 console.log('Administrator created. Remove PROVISION_ADMIN_PASSWORD from the provisioning environment.');
} finally { await db.$disconnect(); }

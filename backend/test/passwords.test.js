import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sessionHash } from '../src/passwords.js';
test('Passwords use salted scrypt hashes and reject wrong passwords', async () => {
 const password = 'Correct testing password 123';
 const first = await hashPassword(password), second = await hashPassword(password);
 assert.notEqual(first, second);
 assert.ok(!first.includes(password));
 assert.equal(await verifyPassword(password, first), true);
 assert.equal(await verifyPassword('wrong password', first), false);
 assert.equal(await verifyPassword(password, 'invalid'), false);
 assert.equal(sessionHash('a'.repeat(64)).length, 64);
});

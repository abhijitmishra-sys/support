CREATE TABLE "PasswordCredential" (
 "userId" TEXT NOT NULL PRIMARY KEY,
 "email" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL,
 CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordCredential_email_key" ON "PasswordCredential"("email");
CREATE TABLE "AuthSession" (
 "tokenHash" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

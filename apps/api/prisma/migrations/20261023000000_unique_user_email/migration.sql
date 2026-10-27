DROP INDEX "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

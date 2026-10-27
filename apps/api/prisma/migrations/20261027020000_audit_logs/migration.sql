CREATE TABLE "AuditLog" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "clinicId" TEXT NOT NULL, "actorUserId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AuditLog_tenantId_clinicId_createdAt_idx" ON "AuditLog"("tenantId", "clinicId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

CREATE TABLE "Document" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "clinicId" TEXT NOT NULL, "patientId" TEXT NOT NULL, "category" TEXT NOT NULL, "fileName" TEXT NOT NULL, "contentType" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Document_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Document_tenantId_storageKey_key" ON "Document"("tenantId", "storageKey");
CREATE INDEX "Document_tenantId_clinicId_patientId_createdAt_idx" ON "Document"("tenantId", "clinicId", "patientId", "createdAt");
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

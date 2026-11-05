ALTER TABLE "Appointment" ADD COLUMN "notificationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "NotificationStatus" ADD VALUE 'SIMULATED';
ALTER TABLE "Notification"
  ADD COLUMN "appointmentId" TEXT,
  ADD COLUMN "deduplicationKey" TEXT,
  ADD COLUMN "deliveryTokenHash" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "lastError" TEXT;
CREATE UNIQUE INDEX "Notification_deduplicationKey_key" ON "Notification"("deduplicationKey");
CREATE TABLE "AutomationConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT NOT NULL DEFAULT 'DRY_RUN',
  "channels" TEXT[] NOT NULL DEFAULT ARRAY['WHATSAPP']::TEXT[],
  "reminderMinutes" INTEGER NOT NULL DEFAULT 1440,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationConnection_clinicId_key" ON "AutomationConnection"("clinicId");
CREATE UNIQUE INDEX "AutomationConnection_tokenHash_key" ON "AutomationConnection"("tokenHash");
CREATE INDEX "AutomationConnection_tenantId_clinicId_idx" ON "AutomationConnection"("tenantId", "clinicId");

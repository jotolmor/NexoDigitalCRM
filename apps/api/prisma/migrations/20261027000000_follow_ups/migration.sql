CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'CONTACTED', 'COMPLETED', 'CANCELLED');
CREATE TABLE "FollowUp" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "clinicId" TEXT NOT NULL, "patientId" TEXT NOT NULL, "appointmentId" TEXT, "title" TEXT NOT NULL, "notes" TEXT, "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING', "dueAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FollowUp_tenantId_clinicId_status_idx" ON "FollowUp"("tenantId", "clinicId", "status");
CREATE INDEX "FollowUp_patientId_dueAt_idx" ON "FollowUp"("patientId", "dueAt");
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

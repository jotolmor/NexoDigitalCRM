CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'BOOKED', 'CANCELLED');
CREATE TABLE "WaitlistEntry" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "clinicId" TEXT NOT NULL, "patientId" TEXT NOT NULL, "professionalId" TEXT, "preferredFrom" TIMESTAMP(3), "preferredTo" TIMESTAMP(3), "notes" TEXT, "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id"));
CREATE INDEX "WaitlistEntry_tenantId_clinicId_status_createdAt_idx" ON "WaitlistEntry"("tenantId", "clinicId", "status", "createdAt");
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

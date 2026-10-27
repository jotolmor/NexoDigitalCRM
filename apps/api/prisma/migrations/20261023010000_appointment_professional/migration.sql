ALTER TABLE "Appointment" ADD COLUMN "professionalId" TEXT;
-- Existing Phase 1 appointments are absent in a new installation; this preserves any legacy rows when a professional exists.
UPDATE "Appointment" SET "professionalId" = (SELECT "id" FROM "Professional" WHERE "Professional"."clinicId" = "Appointment"."clinicId" LIMIT 1);
ALTER TABLE "Appointment" ALTER COLUMN "professionalId" SET NOT NULL;
CREATE INDEX "Appointment_professionalId_startsAt_idx" ON "Appointment"("professionalId", "startsAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Room" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "clinicId" TEXT NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Room_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Room_clinicId_name_key" ON "Room"("clinicId", "name");
CREATE INDEX "Room_tenantId_clinicId_idx" ON "Room"("tenantId", "clinicId");
ALTER TABLE "Room" ADD CONSTRAINT "Room_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD COLUMN "roomId" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

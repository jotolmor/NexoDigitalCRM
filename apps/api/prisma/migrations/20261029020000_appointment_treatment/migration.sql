ALTER TABLE "Appointment" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

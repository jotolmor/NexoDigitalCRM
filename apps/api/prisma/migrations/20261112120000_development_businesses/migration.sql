ALTER TABLE "User" ADD COLUMN "isDeveloper" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "DevelopmentBusiness" (
  "id" TEXT NOT NULL,
  "developerUserId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DevelopmentBusiness_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevelopmentBusiness_developerUserId_fkey" FOREIGN KEY ("developerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DevelopmentBusiness_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DevelopmentBusiness_clinicId_key" ON "DevelopmentBusiness"("clinicId");
CREATE INDEX "DevelopmentBusiness_developerUserId_idx" ON "DevelopmentBusiness"("developerUserId");

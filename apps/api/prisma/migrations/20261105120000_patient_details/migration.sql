ALTER TABLE "Patient"
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "age" INTEGER,
  ADD COLUMN "dateOfBirth" DATE;

ALTER TABLE "Patient"
  ADD CONSTRAINT "Patient_age_range_check" CHECK ("age" IS NULL OR "age" BETWEEN 0 AND 130);

ALTER TABLE "Service" RENAME COLUMN "priceCents" TO "priceEuros";
ALTER TABLE "Service"
  ALTER COLUMN "priceEuros" TYPE DECIMAL(10, 2)
  USING ("priceEuros"::DECIMAL / 100);

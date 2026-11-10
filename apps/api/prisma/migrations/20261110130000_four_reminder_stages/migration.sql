ALTER TABLE "AutomationConnection"
ALTER COLUMN "reminderOffsetsMinutes" SET DEFAULT ARRAY[4320,2880,1440,60]::INTEGER[];

-- Upgrade the previous default without changing custom schedules, modes or channels.
UPDATE "AutomationConnection"
SET "reminderOffsetsMinutes" = ARRAY[4320,2880,1440,60]::INTEGER[], "updatedAt" = CURRENT_TIMESTAMP
WHERE "reminderOffsetsMinutes" = ARRAY[4320,1440,60]::INTEGER[];

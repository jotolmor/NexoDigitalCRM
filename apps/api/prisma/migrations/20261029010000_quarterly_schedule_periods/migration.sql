ALTER TABLE "ScheduleRule"
  ADD COLUMN "validFrom" DATE NOT NULL DEFAULT date_trunc('quarter', CURRENT_DATE::timestamp)::date,
  ADD COLUMN "validTo" DATE NOT NULL DEFAULT (date_trunc('quarter', CURRENT_DATE::timestamp) + interval '3 months' - interval '1 day')::date;

DROP INDEX "ScheduleRule_tenantId_clinicId_professionalId_weekday_idx";
CREATE INDEX "schedule_rule_tenant_quarter_idx"
  ON "ScheduleRule"("tenantId", "clinicId", "professionalId", "weekday", "validFrom", "validTo");

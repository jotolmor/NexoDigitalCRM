SELECT a.id,
       to_char(a."startsAt", 'YYYY-MM-DD HH24:MI') AS hora_utc_guardada,
       to_char((a."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE c.timezone,
               'YYYY-MM-DD HH24:MI') AS hora_local_clinica,
       c.timezone AS zona_horaria,
       a.status
FROM "Appointment" a
JOIN "Patient" p ON p.id = a."patientId"
JOIN "Professional" d ON d.id = a."professionalId"
JOIN "Clinic" c ON c.id = a."clinicId"
WHERE p."firstName" = 'Candela' AND p."lastName" = 'Soto'
  AND d."firstName" = 'Clara' AND d."lastName" = 'Montoro'
  AND a."startsAt" >= TIMESTAMP '2026-11-03 00:00:00'
  AND a."startsAt" < TIMESTAMP '2026-11-05 00:00:00'
ORDER BY a."startsAt";

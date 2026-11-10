#!/usr/bin/env bash
# Run on the existing NexoCRM VPS after fetching the supplied commit.
set -euo pipefail
umask 077

nexo_deploy_ref="${1:?Indica el SHA completo de la actualización}"
if [[ ! "$nexo_deploy_ref" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'El argumento debe ser un SHA completo de 40 caracteres.' >&2
  exit 1
fi
nexo_source_root=/opt/nexocrm
nexo_deploy_root=/opt/nexocrm-deploy
nexo_backup_root=/root/backups/nexocrm
nexo_stamp="$(date +%Y%m%d-%H%M%S)"
git -C "$nexo_source_root" cat-file -e "${nexo_deploy_ref}^{commit}"

nexo_files=(
  apps/api/prisma/schema.prisma
  apps/api/prisma/migrations/20261105120000_patient_details/migration.sql
  apps/api/prisma/migrations/20261105170000_service_specialties/migration.sql
  apps/api/prisma/migrations/20261105180000_patient_dni/migration.sql
  apps/api/prisma/migrations/20261105190000_professional_identifiers/migration.sql
  apps/api/prisma/migrations/20261106100000_n8n_automations/migration.sql
  apps/api/prisma/migrations/20261110120000_reminder_schedule/migration.sql
  apps/api/src/app.module.ts
  apps/api/src/appointments/appointments.service.ts
  apps/api/src/automations/automations.module.ts
  apps/api/src/automations/automations.controller.ts
  apps/api/src/automations/automations.service.ts
  apps/api/src/automations/automation-message.ts
  apps/api/src/automations/reminder-schedule.ts
  apps/web/src/main.tsx
  apps/web/src/appointment-overview.tsx
  apps/web/src/appointment-search.tsx
  apps/web/src/appointment-search.css
  apps/web/src/appointment-person-cards.tsx
  apps/web/src/appointment-person-cards.css
  apps/web/src/appointment-reminder.ts
  apps/web/src/appointments-page.css
  integrations/n8n/nexocrm-notifications.json
  integrations/n8n/README.md
  scripts/setup-n8n-connection.py
)
nexo_deploy_archive="$(mktemp /tmp/nexocrm-n8n-automations.XXXXXX)"
trap 'rm -f "$nexo_deploy_archive"' EXIT
git -C "$nexo_source_root" archive --format=tar --output="$nexo_deploy_archive" "$nexo_deploy_ref" "${nexo_files[@]}"

mkdir -p "$nexo_backup_root"
nexo_existing=()
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]]; then nexo_existing+=("$nexo_file"); fi
done
if (( ${#nexo_existing[@]} )); then
  tar -czf "$nexo_backup_root/fuentes-antes-automatizaciones-n8n-$nexo_stamp.tar.gz" -C "$nexo_source_root" "${nexo_existing[@]}"
fi
tar -xf "$nexo_deploy_archive" -C "$nexo_source_root"

cd "$nexo_deploy_root"
nexo_compose=(docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml)
"${nexo_compose[@]}" config --quiet
"${nexo_compose[@]}" build api web
nexo_db_backup="$nexo_backup_root/antes-automatizaciones-n8n-$nexo_stamp.dump"
"${nexo_compose[@]}" exec -T db pg_dump -U nexocrm -d nexocrm --format=custom > "$nexo_db_backup"
test -s "$nexo_db_backup"
"${nexo_compose[@]}" run --rm --no-deps api npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma
"${nexo_compose[@]}" up -d --no-deps --force-recreate api web
nexo_api_ready=false
for nexo_attempt in {1..30}; do
  if "${nexo_compose[@]}" exec -T api node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||process.env.API_PORT||3000)+"/api/health/ready",{signal:AbortSignal.timeout(2000)}).then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    nexo_api_ready=true
    break
  fi
  sleep 2
done
if [[ "$nexo_api_ready" != true ]]; then
  echo 'La API todavía no está preparada. Revisa los logs del servicio api antes de crear la conexión con n8n.' >&2
  exit 1
fi
printf 'Actualización completada. Copia de base de datos: %s\n' "$nexo_db_backup"

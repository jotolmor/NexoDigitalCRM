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
  apps/api/prisma/migrations/20261105170000_service_specialties/migration.sql
  apps/api/src/catalog/catalog.controller.ts
  apps/api/src/catalog/catalog.service.ts
  apps/web/src/main.tsx
  apps/web/src/dashboard-navigation.tsx
  apps/web/src/flat-cards.css
  apps/web/src/edit-popover.tsx
  apps/web/src/professional-edit.css
  apps/web/src/professional-specialties.tsx
  apps/web/src/registration-sectors.ts
)
nexo_deploy_archive="$(mktemp /tmp/nexocrm-service-specialties.XXXXXX)"
trap 'rm -f "$nexo_deploy_archive"' EXIT
git -C "$nexo_source_root" archive --format=tar --output="$nexo_deploy_archive" "$nexo_deploy_ref" "${nexo_files[@]}"

mkdir -p "$nexo_backup_root"
nexo_existing=()
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]]; then nexo_existing+=("$nexo_file"); fi
done
if (( ${#nexo_existing[@]} )); then
  tar -czf "$nexo_backup_root/fuentes-antes-especialidades-servicio-$nexo_stamp.tar.gz" -C "$nexo_source_root" "${nexo_existing[@]}"
fi
tar -xf "$nexo_deploy_archive" -C "$nexo_source_root"

cd "$nexo_deploy_root"
nexo_compose=(docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml)
"${nexo_compose[@]}" config --quiet
"${nexo_compose[@]}" build api web
nexo_db_backup="$nexo_backup_root/antes-especialidades-servicio-$nexo_stamp.dump"
"${nexo_compose[@]}" exec -T db pg_dump -U nexocrm -d nexocrm --format=custom > "$nexo_db_backup"
test -s "$nexo_db_backup"
"${nexo_compose[@]}" run --rm --no-deps api npx prisma migrate deploy --schema=/app/apps/api/prisma/schema.prisma
"${nexo_compose[@]}" up -d --no-deps --force-recreate api web
printf 'Actualización completada. Copia de base de datos: %s\n' "$nexo_db_backup"

#!/usr/bin/env bash
# Apply only the appointment-search frontend files, preserving server-specific changes.
set -euo pipefail
umask 077
nexo_ref="${1:?Indica el SHA completo de la actualización}"
[[ "$nexo_ref" =~ ^[0-9a-f]{40}$ ]] || { echo 'Se necesita un SHA completo.' >&2; exit 1; }
nexo_source=/opt/nexocrm
nexo_backup="/root/backups/nexocrm/busqueda-citas-$(date +%Y%m%d-%H%M%S).tar.gz"
nexo_files=(apps/web/src/main.tsx apps/web/src/appointment-overview.tsx apps/web/src/appointment-search.tsx apps/web/src/appointment-search.css apps/web/src/appointment-person-cards.tsx apps/web/src/appointment-person-cards.css apps/web/src/appointment-reminder.ts apps/web/src/appointments-page.css apps/web/src/customer-terminology.tsx apps/web/src/patient-create-form.tsx apps/web/src/patient-followup-search.tsx apps/web/src/shift-reservation.tsx apps/web/src/dashboard-navigation.tsx apps/web/src/professional-shifts.tsx apps/web/src/dashboard-navigation.css)
nexo_existing=()
git -C "$nexo_source" cat-file -e "${nexo_ref}^{commit}"
nexo_archive="$(mktemp /tmp/nexocrm-appointment-search.XXXXXX)"
trap 'rm -f "$nexo_archive"' EXIT
git -C "$nexo_source" archive --format=tar --output="$nexo_archive" "$nexo_ref" "${nexo_files[@]}"
mkdir -p /root/backups/nexocrm
for nexo_file in "${nexo_files[@]}"; do
  [[ ! -f "$nexo_source/$nexo_file" ]] || nexo_existing+=("$nexo_file")
done
tar -czf "$nexo_backup" -C "$nexo_source" "${nexo_existing[@]}"
tar -xf "$nexo_archive" -C "$nexo_source"
cd /opt/nexocrm-deploy
nexo_compose=(docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml)
"${nexo_compose[@]}" config --quiet
"${nexo_compose[@]}" build web
"${nexo_compose[@]}" up -d --no-deps --force-recreate web
for nexo_attempt in {1..20}; do
  if curl --fail --silent --output /dev/null http://127.0.0.1:8082/; then
    printf 'Web actualizada. Copia de fuentes: %s\n' "$nexo_backup"
    exit 0
  fi
  sleep 2
done
echo 'La web no respondió; comprueba los logs del servicio web.' >&2
exit 1

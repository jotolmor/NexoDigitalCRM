#!/usr/bin/env bash
# Run on the existing NexoCRM VPS after fetching the supplied commit.
# Moves the appointment and shift assistants from OpenAI to Claude (Anthropic).
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

cd "$nexo_deploy_root"
nexo_compose=(docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml)
"${nexo_compose[@]}" config --quiet
# The key must reach the API container; never print its value.
if ! "${nexo_compose[@]}" config | grep -qE '^\s+ANTHROPIC_API_KEY: \S+'; then
  echo 'El servicio api no recibe ANTHROPIC_API_KEY con valor. Añádela a api.yml y al .env de /opt/nexocrm-deploy antes de desplegar.' >&2
  exit 1
fi

nexo_files=(
  package-lock.json
  apps/api/package.json
  apps/api/src/ai/claude.gateway.ts
  apps/api/src/assistant/assistant.module.ts
  apps/api/src/assistant/assistant.service.ts
  apps/api/src/scheduling/scheduling.module.ts
  apps/api/src/scheduling/shift-assistant.service.ts
)
echo 'Diferencias de los ficheros del VPS frente a la versión que se va a instalar:'
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]] && ! git -C "$nexo_source_root" show "$nexo_deploy_ref:$nexo_file" | cmp -s - "$nexo_source_root/$nexo_file"; then
    echo "  cambia: $nexo_file"
  fi
done

nexo_deploy_archive="$(mktemp /tmp/nexocrm-claude.XXXXXX)"
trap 'rm -f "$nexo_deploy_archive"' EXIT
git -C "$nexo_source_root" archive --format=tar --output="$nexo_deploy_archive" "$nexo_deploy_ref" "${nexo_files[@]}"

mkdir -p "$nexo_backup_root"
nexo_existing=()
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]]; then nexo_existing+=("$nexo_file"); fi
done
nexo_source_backup="$nexo_backup_root/fuentes-antes-asistentes-claude-$nexo_stamp.tar.gz"
tar -czf "$nexo_source_backup" -C "$nexo_source_root" "${nexo_existing[@]}"
tar -xf "$nexo_deploy_archive" -C "$nexo_source_root"

# No database migration in this change.
"${nexo_compose[@]}" build api
"${nexo_compose[@]}" up -d --no-deps --force-recreate api
"${nexo_compose[@]}" exec -T api sh -c 'test -n "$ANTHROPIC_API_KEY"'
printf 'Actualización completada. Copia de las fuentes anteriores: %s\n' "$nexo_source_backup"
printf 'Para volver atrás: tar -xzf %s -C %s y repite build/up de api.\n' "$nexo_source_backup" "$nexo_source_root"

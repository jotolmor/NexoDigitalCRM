#!/usr/bin/env bash
# Run on the existing NexoCRM VPS after fetching the supplied commit.
# Security hardening: required JWT_SECRET, sign-in rate limit, revocable sessions, no proxy CA in images.
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
# The API now refuses to start without a JWT_SECRET of 32+ characters; check its length, never its value.
nexo_secret_length="$("${nexo_compose[@]}" config | sed -nE 's/^[[:space:]]+JWT_SECRET: "?([^"]*)"?$/\1/p' | head -1 | tr -d '\n' | wc -c)"
if (( nexo_secret_length < 32 )); then
  echo "JWT_SECRET del servicio api tiene ${nexo_secret_length} caracteres; hacen falta 32 o más. Genera una con: openssl rand -hex 32, ponla en el .env de /opt/nexocrm-deploy y vuelve a ejecutar." >&2
  exit 1
fi

nexo_files=(
  apps/api/Dockerfile
  apps/web/Dockerfile
  apps/api/src/main.ts
  apps/api/src/auth/auth.module.ts
  apps/api/src/auth/auth.service.ts
  apps/api/src/auth/jwt-auth.guard.ts
  apps/api/src/auth/jwt-secret.ts
  apps/api/src/auth/login-attempts.ts
)
echo 'Diferencias de los ficheros del VPS frente a la versión que se va a instalar:'
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]] && ! git -C "$nexo_source_root" show "$nexo_deploy_ref:$nexo_file" | cmp -s - "$nexo_source_root/$nexo_file"; then
    echo "  cambia: $nexo_file"
  fi
done

nexo_deploy_archive="$(mktemp /tmp/nexocrm-security.XXXXXX)"
trap 'rm -f "$nexo_deploy_archive"' EXIT
git -C "$nexo_source_root" archive --format=tar --output="$nexo_deploy_archive" "$nexo_deploy_ref" "${nexo_files[@]}"

mkdir -p "$nexo_backup_root"
nexo_existing=()
for nexo_file in "${nexo_files[@]}"; do
  if [[ -f "$nexo_source_root/$nexo_file" ]]; then nexo_existing+=("$nexo_file"); fi
done
nexo_source_backup="$nexo_backup_root/fuentes-antes-seguridad-$nexo_stamp.tar.gz"
tar -czf "$nexo_source_backup" -C "$nexo_source_root" "${nexo_existing[@]}"
tar -xf "$nexo_deploy_archive" -C "$nexo_source_root"

# No database migration in this change.
"${nexo_compose[@]}" build api web
"${nexo_compose[@]}" up -d --no-deps --force-recreate api web
for nexo_try in $(seq 1 20); do
  if curl -fsS https://nexocrm.nexodigitaldesing.com/api/health/ready >/dev/null 2>&1; then echo 'API lista.'; break; fi
  if (( nexo_try == 20 )); then
    echo 'La API no responde tras 60 s. Revisa el registro con: docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml logs --tail=50 api' >&2
    exit 1
  fi
  sleep 3
done
printf 'Actualización completada. Copia de las fuentes anteriores: %s\n' "$nexo_source_backup"
printf 'Para volver atrás: tar -xzf %s -C %s y repite build/up de api y web.\n' "$nexo_source_backup" "$nexo_source_root"

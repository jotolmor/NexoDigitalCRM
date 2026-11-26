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
# The API now refuses to start without its own JWT_SECRET of 32+ characters.
# Measure it as the api container sees it (current image, same environment); never print the value.
nexo_secret_check="$("${nexo_compose[@]}" run --rm --no-deps -T --entrypoint sh api -c 'case "$JWT_SECRET" in replace-with-a-long-random-secret|development-only-secret-change-before-deployment) echo public;; *) printf %s "$JWT_SECRET" | wc -c;; esac' | tr -d '[:space:]')"
if [[ "$nexo_secret_check" == public || ! "$nexo_secret_check" =~ ^[0-9]+$ ]] || (( nexo_secret_check < 32 )); then
  echo "El servicio api no recibe un JWT_SECRET válido (resultado: ${nexo_secret_check:-vacío}); hace falta una clave propia de 32 caracteres o más." >&2
  echo "1) Genera una con: openssl rand -hex 32  2) Ponla en /opt/nexocrm-deploy/.env como JWT_SECRET=...  3) Comprueba que api.yml pasa JWT_SECRET al servicio api." >&2
  echo "Al cambiar la clave se cierran todas las sesiones abiertas: cada usuario tendrá que volver a iniciar sesión." >&2
  exit 1
fi

nexo_files=(
  apps/api/Dockerfile
  apps/web/Dockerfile
  apps/api/src/main.ts
  apps/api/src/auth/auth.controller.ts
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
for nexo_try in {1..30}; do
  if "${nexo_compose[@]}" exec -T api node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||process.env.API_PORT||3000)+"/api/health/ready",{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then echo 'API lista.'; break; fi
  if (( nexo_try == 30 )); then
    echo "La API no responde tras 60 s. Copia de las fuentes anteriores: $nexo_source_backup" >&2
    echo 'Revisa el registro con: docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml logs --tail=50 api' >&2
    exit 1
  fi
  sleep 2
done
printf 'Actualización completada. Copia de las fuentes anteriores: %s\n' "$nexo_source_backup"
printf 'Para volver atrás: tar -xzf %s -C %s y repite build/up de api y web.\n' "$nexo_source_backup" "$nexo_source_root"

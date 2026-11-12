#!/usr/bin/env bash
set -euo pipefail
umask 077
nexo_ref="${1:?Indica el SHA completo de la actualización}"
[[ "$nexo_ref" =~ ^[0-9a-f]{40}$ ]] || { echo 'Se necesita un SHA completo.' >&2; exit 1; }
nexo_source=/opt/nexocrm
nexo_backup="/root/backups/nexocrm/registro-$(date +%Y%m%d-%H%M%S).tar.gz"
nexo_file=apps/api/src/auth/auth.service.ts
git -C "$nexo_source" cat-file -e "${nexo_ref}^{commit}"
nexo_archive="$(mktemp /tmp/nexocrm-registration.XXXXXX)"
trap 'rm -f "$nexo_archive"' EXIT
git -C "$nexo_source" archive --format=tar --output="$nexo_archive" "$nexo_ref" "$nexo_file"
mkdir -p /root/backups/nexocrm
tar -czf "$nexo_backup" -C "$nexo_source" "$nexo_file"
tar -xf "$nexo_archive" -C "$nexo_source"
cd /opt/nexocrm-deploy
nexo_compose=(docker compose -f docker-compose.yml -f api.yml -f web.yml -f public.yml)
"${nexo_compose[@]}" config --quiet
"${nexo_compose[@]}" build api
"${nexo_compose[@]}" up -d --no-deps --force-recreate api
for nexo_attempt in {1..30}; do
  if "${nexo_compose[@]}" exec -T api node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||process.env.API_PORT||3000)+"/api/health/ready",{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    printf 'Registro actualizado. Copia de fuentes: %s\n' "$nexo_backup"
    exit 0
  fi
  sleep 2
done
echo 'La API no está preparada; comprueba sus logs.' >&2
exit 1

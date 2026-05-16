#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.https.yml"
ENV_FILE=".env.production"
TEMPLATE_FILE="nginx.https.conf.template"
BACKUP_FILE="${TEMPLATE_FILE}.bak"

if [ ! -f "$ENV_FILE" ]; then
  echo "Ошибка: создайте $ENV_FILE на основе .env.production.example"
  echo "Пример: cp .env.production.example .env.production && nano .env.production"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

if [ -z "${DOMAIN:-}" ] || [ -z "${WWW_DOMAIN:-}" ] || [ -z "${CERT_EMAIL:-}" ]; then
  echo "Ошибка: в $ENV_FILE должны быть DOMAIN, WWW_DOMAIN и CERT_EMAIL"
  exit 1
fi

mkdir -p certbot/www certbot/conf

cp "$TEMPLATE_FILE" "$BACKUP_FILE"
restore_template() {
  if [ -f "$BACKUP_FILE" ]; then
    mv "$BACKUP_FILE" "$TEMPLATE_FILE"
  fi
}
trap restore_template EXIT

cat > "$TEMPLATE_FILE" <<'NGINX'
server {
    listen 80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://server:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }
}
NGINX

echo "Запускаю временный HTTP nginx для проверки домена и выпуска сертификата..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build server nginx

echo "Запрашиваю сертификат Let's Encrypt для $DOMAIN и $WWW_DOMAIN..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$CERT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "$WWW_DOMAIN"

restore_template
trap - EXIT

echo "Перезапускаю nginx с HTTPS-конфигурацией..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build --force-recreate nginx server

echo "Готово: https://$DOMAIN"

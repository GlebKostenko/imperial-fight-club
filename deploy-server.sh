#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.https.yml"
ENV_FILE=".env.production"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

install_docker_ubuntu() {
  if need_cmd docker && docker compose version >/dev/null 2>&1; then
    echo "Docker и Docker Compose plugin уже установлены."
    return
  fi

  echo "Устанавливаю Docker и Docker Compose plugin..."
  sudo apt update
  sudo apt install -y ca-certificates curl gnupg lsb-release docker.io docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl enable containerd || true
  sudo systemctl start docker
}

write_env() {
  local domain="$1"
  local email="$2"
  local www_domain="${3:-www.$domain}"
  local secret

  if need_cmd openssl; then
    secret="$(openssl rand -hex 32)"
  else
    secret="replace-with-long-random-secret-$(date +%s)"
  fi

  cat > "$ENV_FILE" <<EOF
DOMAIN=$domain
WWW_DOMAIN=$www_domain
CERT_EMAIL=$email
JWT_SECRET=$secret
EOF

  echo "Создан $ENV_FILE"
}

create_renew_cron() {
  local cron_file="/etc/cron.d/apex-fight-club-certbot"
  local cmd="cd $PROJECT_DIR && /usr/bin/docker compose -f $COMPOSE_FILE --env-file $ENV_FILE run --rm certbot renew --quiet && /usr/bin/docker compose -f $COMPOSE_FILE --env-file $ENV_FILE exec -T nginx nginx -s reload >/dev/null 2>&1"

  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "Для создания cron-задачи нужен sudo. Добавляю через sudo..."
    echo "17 3 * * * root $cmd" | sudo tee "$cron_file" >/dev/null
  else
    echo "17 3 * * * root $cmd" > "$cron_file"
  fi
  echo "Добавлено автообновление сертификата: $cron_file"
}

usage() {
  cat <<EOF
Использование:
  ./deploy-server.sh setup DOMAIN EMAIL [WWW_DOMAIN]
  ./deploy-server.sh start
  ./deploy-server.sh restart
  ./deploy-server.sh stop
  ./deploy-server.sh logs
  ./deploy-server.sh renew-cert
  ./deploy-server.sh status

Примеры:
  ./deploy-server.sh setup imperial-fight.ru admin@imperial-fight.ru www.imperial-fight.ru
  ./deploy-server.sh start
  ./deploy-server.sh restart
EOF
}

cmd="${1:-}"
case "$cmd" in
  setup)
    domain="${2:-}"
    email="${3:-}"
    www_domain="${4:-www.${domain}}"
    if [ -z "$domain" ] || [ -z "$email" ]; then
      usage
      exit 1
    fi

    install_docker_ubuntu
    write_env "$domain" "$email" "$www_domain"
    chmod +x ./issue-cert.sh

    echo "Открытые порты на сервере должны быть: 80 и 443. DNS A-записи домена уже должны указывать на IP сервера."
    ./issue-cert.sh
    create_renew_cron

    echo ""
    echo "Проект развернут. Проверьте: https://$domain"
    ;;

  start)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните: ./deploy-server.sh setup DOMAIN EMAIL [WWW_DOMAIN]"
      exit 1
    fi
    compose up -d --build
    ;;

  restart)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните setup."
      exit 1
    fi
    compose restart
    ;;

  stop)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните setup."
      exit 1
    fi
    compose down
    ;;

  logs)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните setup."
      exit 1
    fi
    compose logs -f --tail=200
    ;;

  renew-cert)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните setup."
      exit 1
    fi
    compose run --rm certbot renew
    compose exec -T nginx nginx -s reload
    ;;

  status)
    if [ ! -f "$ENV_FILE" ]; then
      echo "Нет $ENV_FILE. Сначала выполните setup."
      exit 1
    fi
    compose ps
    ;;

  *)
    usage
    exit 1
    ;;
esac

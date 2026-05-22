#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env.http}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

as_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

install_docker_ubuntu() {
  if need_cmd docker && docker compose version >/dev/null 2>&1; then
    echo "Docker и Docker Compose plugin уже установлены."
    return
  fi

  if ! need_cmd apt; then
    echo "Автоустановка Docker поддержана только для Ubuntu/Debian."
    echo "Установите Docker и Docker Compose plugin вручную, затем повторите команду."
    exit 1
  fi

  echo "Устанавливаю Docker и Docker Compose plugin..."
  as_root apt update
  as_root apt install -y ca-certificates curl gnupg docker.io docker-compose-plugin
  as_root systemctl enable docker || true
  as_root systemctl start docker || true
}

random_secret() {
  if need_cmd openssl; then
    openssl rand -hex 32
  else
    echo "replace-with-long-random-secret-$(date +%s)"
  fi
}

write_env() {
  local host="${1:-}"
  local port="${2:-80}"
  local secret
  secret="$(random_secret)"

  cat > "$ENV_FILE" <<EOF
HTTP_PORT=$port
PUBLIC_HOST=$host
JWT_SECRET=$secret
EOF

  echo "Создан $ENV_FILE"
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Нет $ENV_FILE, создаю минимальный HTTP env."
    write_env "" "${HTTP_PORT:-80}"
  fi
}

prepare_dirs() {
  mkdir -p server/uploads certbot/www
}

allow_http_port() {
  local port="$1"
  if need_cmd ufw; then
    as_root ufw allow "${port}/tcp" || true
  elif need_cmd firewall-cmd; then
    as_root firewall-cmd --permanent --add-port="${port}/tcp" || true
    as_root firewall-cmd --reload || true
  fi
}

public_url() {
  local host="${1:-}"
  local port="${2:-80}"
  if [ -z "$host" ]; then
    host="IP_СЕРВЕРА"
  fi
  if [ "$port" = "80" ]; then
    echo "http://$host"
  else
    echo "http://$host:$port"
  fi
}

usage() {
  cat <<EOF
Использование:
  ./deploy-http.sh setup [HOST_OR_IP] [PORT]
  ./deploy-http.sh start
  ./deploy-http.sh restart
  ./deploy-http.sh stop
  ./deploy-http.sh logs
  ./deploy-http.sh status
  ./deploy-http.sh seed

Примеры:
  ./deploy-http.sh setup 203.0.113.10
  ./deploy-http.sh setup my-domain.ru 8080
  ./deploy-http.sh start

Скрипт запускает приложение только по HTTP через docker-compose.yml.
HTTPS, certbot и редиректы на HTTPS здесь не используются.
EOF
}

cmd="${1:-}"
case "$cmd" in
  setup)
    host="${2:-}"
    port="${3:-80}"
    install_docker_ubuntu
    write_env "$host" "$port"
    prepare_dirs
    allow_http_port "$port"
    compose up -d --build
    echo ""
    echo "Готово. Откройте: $(public_url "$host" "$port")"
    echo "Админка: $(public_url "$host" "$port")/admin/"
    ;;

  start)
    ensure_env
    prepare_dirs
    compose up -d --build
    echo "HTTP-запуск выполнен."
    ;;

  restart)
    ensure_env
    compose restart
    ;;

  stop)
    ensure_env
    compose down
    ;;

  logs)
    ensure_env
    compose logs -f --tail=200
    ;;

  status)
    ensure_env
    compose ps
    ;;

  seed)
    ensure_env
    compose exec -T server python seed.py
    ;;

  *)
    usage
    exit 1
    ;;
esac

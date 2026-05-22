# Деплой на сервер по IP через GitHub Actions

Этот вариант деплоит проект на сервер по SSH и открывает сайт по HTTP:

```text
http://IP_СЕРВЕРА
http://IP_СЕРВЕРА/admin/
```

## 1. Подготовьте сервер

На сервере нужен Ubuntu/Debian-пользователь с SSH-доступом. Docker можно заранее не ставить: `deploy-http.sh` попробует установить Docker и Docker Compose plugin сам.

Откройте порт `80` в панели хостинга и firewall сервера.

## 2. Добавьте секреты в GitHub

Откройте репозиторий на GitHub:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Добавьте:

```text
SERVER_HOST      IP сервера, например 203.0.113.10
SERVER_USER      пользователь SSH, например root или ubuntu
SERVER_SSH_KEY   приватный SSH-ключ для входа на сервер
```

Если SSH работает не на `22` порту, добавьте еще:

```text
SERVER_PORT      SSH-порт
```

## 3. Необязательные переменные

В `Settings -> Secrets and variables -> Actions -> Variables` можно добавить:

```text
DEPLOY_PATH      папка проекта на сервере, по умолчанию /opt/fight-club
HTTP_PORT        внешний HTTP-порт, по умолчанию 80
```

## 4. Как запускается деплой

Workflow находится в:

```text
.github/workflows/deploy-ip.yml
```

Он запускается автоматически при `push` в ветку `main`. Также его можно запустить вручную:

```text
GitHub -> Actions -> Deploy to server by IP -> Run workflow
```

При первом запуске workflow создаст `.env.http` на сервере и выполнит:

```bash
./deploy-http.sh setup IP_СЕРВЕРА 80
```

При следующих запусках он обновит файлы проекта и выполнит:

```bash
./deploy-http.sh start
```

Загруженные через админку файлы в `server/uploads` не удаляются при деплое.

## Если IP изменится

Поменяйте `SERVER_HOST` в GitHub Secrets на новый IP и запустите workflow заново.

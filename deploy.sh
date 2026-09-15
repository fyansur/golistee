#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/golistee

git fetch origin main
git reset --hard origin/main

docker compose up -d --build --remove-orphans

docker compose ps
docker compose logs --tail=100 server
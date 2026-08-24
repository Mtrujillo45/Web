#!/bin/sh
set -e

echo "Aplicando migraciones de base de datos..."
npx prisma migrate deploy

echo "Asegurando usuarios internos (comercial/producción)..."
npx tsx prisma/seed.ts

echo "Iniciando servidor..."
exec node server.js

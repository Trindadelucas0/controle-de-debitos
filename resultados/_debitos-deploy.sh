#!/bin/bash
set -euo pipefail
cd ~/projetos/controle-de-debitos

DATA_DIR="2. RELAÇÃO DE DEBITOS/dashboard/data"
BACKUP_DIR="/tmp/debitos-data-backup"
mkdir -p "$BACKUP_DIR"

echo "=== BEFORE ==="
git log -1 --oneline
git rev-parse HEAD

echo "=== BACKUP JSON ==="
cp -a "$DATA_DIR/empresas.json" "$BACKUP_DIR/empresas.json"
cp -a "$DATA_DIR/cadastro-consultas.json" "$BACKUP_DIR/cadastro-consultas.json"
ls -l "$BACKUP_DIR/empresas.json" "$BACKUP_DIR/cadastro-consultas.json"
EMP_BEFORE=$(stat -c%s "$BACKUP_DIR/empresas.json")
CAD_BEFORE=$(stat -c%s "$BACKUP_DIR/cadastro-consultas.json")
echo "backup empresas.json bytes=$EMP_BEFORE"
echo "backup cadastro-consultas.json bytes=$CAD_BEFORE"

echo "=== UNSKIP JSON ==="
git update-index --no-skip-worktree "$DATA_DIR/empresas.json" "$DATA_DIR/cadastro-consultas.json" || true

echo "=== RESTORE TRACKED FILES THAT WOULD BLOCK PULL ==="
git restore -- "$DATA_DIR/empresas.json" "$DATA_DIR/cadastro-consultas.json" || true
git restore -- "2. RELAÇÃO DE DEBITOS/scripts/__pycache__/build_dashboard_data.cpython-314.pyc" || true
git restore -- "2. RELAÇÃO DE DEBITOS/scripts/__pycache__/extrair_debitos.cpython-314.pyc" || true
git restore -- "2. RELAÇÃO DE DEBITOS/scripts/__pycache__/ingest_upload.cpython-314.pyc" || true

echo "=== PULL ==="
git fetch origin
git pull --ff-only origin main

echo "=== RESTORE PRODUCTION JSON ==="
cp -a "$BACKUP_DIR/empresas.json" "$DATA_DIR/empresas.json"
cp -a "$BACKUP_DIR/cadastro-consultas.json" "$DATA_DIR/cadastro-consultas.json"
EMP_AFTER=$(stat -c%s "$DATA_DIR/empresas.json")
CAD_AFTER=$(stat -c%s "$DATA_DIR/cadastro-consultas.json")
echo "restored empresas.json bytes=$EMP_AFTER"
echo "restored cadastro-consultas.json bytes=$CAD_AFTER"
if [ "$EMP_AFTER" != "$EMP_BEFORE" ] || [ "$CAD_AFTER" != "$CAD_BEFORE" ]; then
  echo "ERROR: restored JSON size differs from backup"
  exit 1
fi

echo "=== SKIP-WORKTREE AGAIN ==="
git update-index --skip-worktree "$DATA_DIR/empresas.json" "$DATA_DIR/cadastro-consultas.json"

echo "=== BUILD ==="
cd "2. RELAÇÃO DE DEBITOS/dashboard"
npm run build

echo "=== PM2 RESTART ==="
pm2 restart dashboard-debitos
sleep 3
pm2 show dashboard-debitos | sed -n "1,40p"

echo "=== AFTER ==="
cd ~/projetos/controle-de-debitos
git log -1 --oneline
git rev-parse HEAD
echo "=== SKIP-WORKTREE AFTER ==="
git ls-files -v | grep "^S" || true
echo "=== JSON PRESERVED ==="
ls -l "$DATA_DIR/empresas.json" "$DATA_DIR/cadastro-consultas.json"
cmp -s "$BACKUP_DIR/empresas.json" "$DATA_DIR/empresas.json" && echo "empresas.json MATCH backup"
cmp -s "$BACKUP_DIR/cadastro-consultas.json" "$DATA_DIR/cadastro-consultas.json" && echo "cadastro-consultas.json MATCH backup"

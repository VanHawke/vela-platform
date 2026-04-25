#!/bin/bash
# scripts/deploy-hetzner.sh — Deploy to Hetzner kiko-worker
# Usage: ./scripts/deploy-hetzner.sh [--full|--api|--monitors|--worker]
# Default: syncs api/, monitors/, kiko-worker/ and restarts PM2

set -e

SERVER="root@178.104.73.22"
REMOTE="/home/kiko/kiko-worker"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-full}"

echo "╔══════════════════════════════════════╗"
echo "║  Kiko Hetzner Deploy                 ║"
echo "║  Mode: $MODE                         ║"
echo "╚══════════════════════════════════════╝"

# Step 1: Syntax check locally
echo "[1/5] Syntax checking..."
ERRORS=0
for f in $(find "$LOCAL/api" "$LOCAL/monitors" "$LOCAL/kiko-worker/src" -name "*.js" -newer "$LOCAL/.last-deploy" 2>/dev/null || find "$LOCAL/api" "$LOCAL/monitors" "$LOCAL/kiko-worker/src" -name "*.js"); do
  if ! node --check "$f" 2>/dev/null; then
    echo "  ✗ FAILED: $f"
    ERRORS=$((ERRORS+1))
  fi
done
if [ $ERRORS -gt 0 ]; then
  echo "  ✗ $ERRORS syntax errors — aborting deploy"
  exit 1
fi
echo "  ✓ All files pass syntax check"

# Step 2: Sync files
echo "[2/5] Syncing files to Hetzner..."
if [ "$MODE" = "full" ] || [ "$MODE" = "api" ]; then
  rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='logs' \
    "$LOCAL/api/" "$SERVER:$REMOTE/api/"
  echo "  ✓ api/ synced"
fi

if [ "$MODE" = "full" ] || [ "$MODE" = "monitors" ]; then
  rsync -avz --delete \
    "$LOCAL/monitors/" "$SERVER:$REMOTE/monitors/"
  echo "  ✓ monitors/ synced"
fi

if [ "$MODE" = "full" ] || [ "$MODE" = "worker" ]; then
  rsync -avz \
    "$LOCAL/kiko-worker/src/" "$SERVER:$REMOTE/src/"
  rsync -avz \
    "$LOCAL/kiko-worker/server.js" "$SERVER:$REMOTE/server.js"
  rsync -avz \
    "$LOCAL/kiko-worker/ecosystem.config.cjs" "$SERVER:$REMOTE/ecosystem.config.cjs"
  echo "  ✓ kiko-worker/ synced"
fi

# Step 3: Fix ownership
echo "[3/5] Setting file ownership..."
ssh "$SERVER" "chown -R kiko:kiko $REMOTE/api/ $REMOTE/monitors/ $REMOTE/src/ $REMOTE/server.js"
echo "  ✓ Ownership set to kiko:kiko"

# Step 4: Restart PM2
echo "[4/5] Restarting kiko-worker..."
ssh "$SERVER" "su - kiko -c 'cd $REMOTE && pm2 restart kiko-worker && pm2 save'" 2>&1 | grep -E "✓|online|error"
echo "  ✓ PM2 restarted"

# Step 5: Health check
echo "[5/5] Health check..."
sleep 3
HEALTH=$(ssh "$SERVER" "su - kiko -c 'pm2 logs kiko-worker --out --lines 5 --nostream'" 2>&1 | grep -E "listening|monitor|scheduler|error" | tail -5)
echo "$HEALTH"

# Mark deploy timestamp
touch "$LOCAL/.last-deploy"
echo ""
echo "═══════════════════════════════════════"
echo "  Deploy complete: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"

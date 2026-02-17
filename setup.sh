#!/bin/bash
set -e

echo "============================================"
echo " Moltbot Starter Kit — Setup"
echo "============================================"

# Prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install v18+."; exit 1; }
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || echo "⚠ Node.js v18+ recommended (found $(node -v))"

echo "✓ node $(node -v), npm $(npm -v)"

# Install
echo "📦 Installing dependencies..."
npm install

# Wallet
if [ ! -f wallet.pem ]; then
    echo "🔑 Generating wallet..."
    npx ts-node scripts/generate_wallet.ts 2>/dev/null || echo "⚠ Wallet generation skipped (run manually: npx ts-node scripts/generate_wallet.ts)"
fi

# Build
echo "🔨 Building..."
npm run build

echo ""
echo "✅ Setup complete!"

#!/bin/bash

echo "🚀 Setting up Moltbot Starter Kit..."

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18+."
    exit 1
fi

# 2. Install Dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Setup Config
if [ ! -f .env ]; then
    echo "⚙️  Creating .env from example..."
    cp .env.example .env 2>/dev/null || echo "MULTIVERSX_CHAIN_ID=D" > .env
fi

if [ ! -f config.json ]; then
    echo "⚙️  Creating config.json..."
    echo '{ "agentName": "MoltBot-Gen1", "nonce": 0, "pricing": "1USDC", "capabilities": ["search", "compute"] }' > config.json
fi

# 4. Generate Wallet
if [ ! -f wallet.pem ]; then
    echo "🔑 Generating Wallet..."
    npx ts-node scripts/generate_wallet.ts
else
    echo "✅ Wallet found."
fi

echo "✅ Setup Complete! Run 'npm run start' to launch."

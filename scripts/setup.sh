#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "  VoxPilot — Project Setup"
echo "========================================="

# Copy env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
  echo "  → Edit .env with your API keys!"
else
  echo "✓ .env already exists"
fi

# Python venv
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "✓ Created Python virtualenv"
fi

source .venv/bin/activate
pip install --upgrade pip setuptools wheel -q
pip install -r requirements.txt -q
echo "✓ Python dependencies installed"

# Node deps
npm install --silent 2>/dev/null
echo "✓ Node dependencies installed"

# Build Tailwind CSS
npx tailwindcss -i ./web/static/css/brutalist.css -o ./web/static/css/output.css --minify 2>/dev/null
echo "✓ Tailwind CSS built"

# Download LiveKit SDK
if [ ! -f web/static/js/lk-sdk.min.js ]; then
  curl -sL https://unpkg.com/livekit-client@2.5.7/dist/livekit-client.umd.min.js \
    -o web/static/js/lk-sdk.min.js
  echo "✓ LiveKit client SDK downloaded"
fi

# Create fonts dir
mkdir -p web/static/fonts

echo ""
echo "========================================="
echo "  Setup complete!"
echo ""
echo "  1. Edit .env with your API keys"
echo "  2. Start server:  python -m server.main"
echo "  3. Start agent:   python -m server.agent start"
echo "  4. Open:          http://localhost:8890"
echo "========================================="
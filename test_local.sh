#!/bin/bash
echo "=== Setting up local environment ==="

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Copying .env.example to .env..."
        cp .env.example .env
    else
        echo "Error: .env.example not found."
        exit 1
    fi
fi
echo "=== Generating docs/config.js from environment ==="
if [ -f .env ]; then
    SUPABASE_URL=$(grep '^SUPABASE_URL=' .env | head -n 1 | cut -d '=' -f2-)
    SUPABASE_ANON_KEY=$(grep '^SUPABASE_ANON_KEY=' .env | head -n 1 | cut -d '=' -f2-)
    cat << EOF > docs/config.js
const SUPABASE_URL = "${SUPABASE_URL}";
const SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
EOF
    echo "docs/config.js updated."
else
    echo "Warning: .env missing."
fi

echo "=== Creating Virtual Environment ==="
python3 -m venv .venv
source .venv/bin/activate

echo "=== Installing Dependencies ==="
pip install -r requirements.txt -q

echo "=== Running flight_bot.py ==="
python flight_bot.py
echo "=== Done ==="

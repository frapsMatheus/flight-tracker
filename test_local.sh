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

echo "=== Creating Virtual Environment ==="
python3 -m venv .venv
source .venv/bin/activate

echo "=== Installing Dependencies ==="
pip install -r requirements.txt -q

echo "=== Running flight_bot.py ==="
python flight_bot.py
echo "=== Done ==="

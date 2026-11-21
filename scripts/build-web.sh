#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs |
    sh -s -- -y --profile minimal --no-modify-path
  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
fi

rustup target add wasm32-unknown-unknown
cargo build --locked --release --lib --target wasm32-unknown-unknown
mkdir -p dist
cp web/index.html web/style.css web/app.js dist/
cp -r web/voice dist/
mkdir -p dist/art
for poem in {001..100}; do
  cp "web/art/${poem}.webp" dist/art/
done
mkdir -p dist/portraits
for portrait in {01..16}; do
  cp "web/portraits/${portrait}.webp" dist/portraits/
done
cp "${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/release/hundred_waka.wasm" dist/

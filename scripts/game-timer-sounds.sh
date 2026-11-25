#!/usr/bin/env bash
# Генерирует звуки таймера встречи в apps/miniapp/public/sounds (нужны macOS `say` с голосом Milena, ffmpeg, bc).
# Клипы: beep (сигнал), minute («Последняя минута»), attack («Последняя атака»), whistle (свисток), time («Время»);
# keepawake.mp4 — беззвучное видео, чтобы экран не гас. Результат закоммичен, скрипт нужен для перегенерации.
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/apps/miniapp/public/sounds"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

# encode <вход> <имя>: моно 22.05 кГц, выравнивание громкости, mp3 48 кбит/с.
encode() {
  ffmpeg -loglevel error -y -i "$1" -af "loudnorm=I=-12:TP=-1" -ar 22050 -ac 1 -codec:a libmp3lame -b:a 48k "$out/$2.mp3"
}

say -v Milena -o "$tmp/minute.aiff" "Последняя минута"
say -v Milena -o "$tmp/attack.aiff" "Последняя атака"
say -v Milena -o "$tmp/time.aiff" "Время"
encode "$tmp/minute.aiff" minute
encode "$tmp/attack.aiff" attack
encode "$tmp/time.aiff" time

# Сигнал: 1760 Гц, 0,18 с.
dur=0.18
fade_at="$(printf "%.2f" "$(echo "$dur-0.03" | bc)")"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=1760:duration=$dur" \
  -af "afade=t=in:d=0.01,afade=t=out:st=$fade_at:d=0.03" "$tmp/beep.wav"
encode "$tmp/beep.wav" beep

# Свисток: 3 кГц с быстрым вибрато, 1,6 с.
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=3000:duration=1.6" \
  -af "vibrato=f=28:d=0.6,afade=t=in:d=0.02,afade=t=out:st=1.45:d=0.15" "$tmp/whistle.wav"
encode "$tmp/whistle.wav" whistle

# 2 с чёрного видео 16x16 с тишиной.
ffmpeg -loglevel error -y -f lavfi -i "color=c=black:s=16x16:r=1:d=2" -f lavfi -i "anullsrc=r=8000:cl=mono" -t 2 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 8k -movflags +faststart -shortest "$out/keepawake.mp4"
ls -la "$out"

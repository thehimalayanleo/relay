#!/bin/zsh
set -eu

script_dir="${0:A:h}"
repo_root="${script_dir:h}"
output_dir="$script_dir/out"
duration="${1:-90}"
server="${PASS_ON_SERVER:-http://127.0.0.1:4317}"
movie="$output_dir/relay-user1-sailbox-user2.mov"
video="$output_dir/relay-user1-sailbox-user2.mp4"

if ! [[ "$duration" =~ '^[0-9]+$' ]] || (( duration < 20 )); then
  print -u2 "Usage: ./demo/record-demo.sh [duration-seconds, at least 20]"
  exit 2
fi

for command_name in docker node ffmpeg screencapture open; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    print -u2 "Missing required command: $command_name"
    exit 1
  fi
done

health="$(node -e '
  const base = process.argv[1].replace(/\/$/, "");
  const response = await fetch(`${base}/health`);
  if (!response.ok) throw new Error(`PassOn Core returned HTTP ${response.status}`);
  process.stdout.write(JSON.stringify(await response.json()));
' "$server")"

node -e '
  const health = JSON.parse(process.argv[1]);
  if (!health.ok) throw new Error("PassOn Core is not ready");
  if (health.workPod?.provider !== "sail") {
    throw new Error(`This live demo requires the Sail provider; found ${health.workPod?.provider ?? "none"}`);
  }
  console.log(`VERIFIED  Relay Core + live ${health.workPod.provider} provider`);
' "$health"

mkdir -p "$output_dir"
if [[ -f "$movie" ]]; then
  mv "$movie" "$output_dir/passon-demo-previous-$(date +%Y%m%d-%H%M%S).mov"
fi
if [[ -f "$video" ]]; then
  mv "$video" "$output_dir/passon-demo-previous-$(date +%Y%m%d-%H%M%S).mp4"
fi
rm -f "$output_dir/share-url.txt" "$output_dir/user1-completed-at.txt"

print "Prebuilding the tiny User 1 image..."
docker compose -f "$script_dir/compose.yml" build user1 >/dev/null

print "Recording the main display for ${duration}s."
print "macOS may ask for Screen Recording permission on the first run."
open "$repo_root/apps/macos/dist/Relay.app"
sleep 2
screencapture -v -m -V"$duration" -k "$movie" &
capture_pid=$!

sleep 2
open -a Terminal "$script_dir/run-user1.command"

for attempt in {1..90}; do
  [[ -s "$output_dir/share-url.txt" ]] && break
  sleep 1
done

if [[ -s "$output_dir/share-url.txt" ]]; then
  sleep 2
  open -a Terminal "$script_dir/run-user2.command"
else
  print -u2 "User 1 did not emit a capability in time. The recording will still be preserved."
fi

wait "$capture_pid"

if [[ ! -s "$movie" ]]; then
  print -u2 "No screen recording was produced. Grant Screen Recording access and retry."
  exit 1
fi

ffmpeg -hide_banner -loglevel error -y -i "$movie" \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -movflags +faststart \
  "$video"

print
print "DONE  Demo video: $video"
print "SAFE CAPTURE  The capability URL was never printed or opened, and User 2 terminated the pod."

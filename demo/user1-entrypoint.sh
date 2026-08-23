#!/bin/sh
set -eu

server="${PASS_ON_SERVER:-http://host.docker.internal:4317}"
receiver_origin="${PASS_ON_RECEIVER_ORIGIN:-http://127.0.0.1:4317}"
output_dir="${PASS_ON_DEMO_OUT:-/demo/out}"

mkdir -p "$output_dir"

printf '\nRELAY  /  USER 1  /  DOCKER\n'
printf '----------------------------------------\n'
printf 'WORKFLOW SIMULATION  /  NO ARC SCORE\n'
printf 'Agent:  simulated-puzzle-observer\n'
printf 'Goal:   transfer observed mechanics without claiming a solution\n'
printf 'Core:   %s\n\n' "$server"

health_json="$(node ./bin/passon.mjs doctor --server "$server")"
provider="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.workPod?.provider ?? "unknown")' "$health_json")"
if [ "$provider" != "sail" ]; then
  printf 'ERROR   Expected Sail provider, found %s\n' "$provider" >&2
  exit 1
fi
printf 'VERIFIED  Relay Core reports provider=sail\n'

transfer_json="$(node ./bin/passon.mjs create ./demo/arc-agi-3-scenario.json \
  --server "$server" \
  --pod \
  --ttl 1)"
container_url="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.shareUrl)' "$transfer_json")"
pod_state="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.workPod?.state ?? "unknown")' "$transfer_json")"

share_url="$(node -e '
  const source = new URL(process.argv[1]);
  const destination = new URL(process.argv[2]);
  source.protocol = destination.protocol;
  source.host = destination.host;
  process.stdout.write(source.toString());
' "$container_url" "$receiver_origin")"

printf '%s\n' "$share_url" > "$output_dir/share-url.txt"
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$output_dir/user1-completed-at.txt"

printf 'SAILBOX  CAMP.json + HANDOFF.md + manifest.json\n'
printf 'SEALED   private work pod state=%s\n' "$pod_state"
printf 'READY   capability link written to demo/out/share-url.txt\n\n'
printf 'Control can now move to User 2 on macOS.\n'

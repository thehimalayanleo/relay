#!/bin/zsh
set -eu

script_dir="${0:A:h}"
repo_root="${script_dir:h}"
url_file="$script_dir/out/share-url.txt"

cd "$repo_root"
clear
print "RELAY  |  USER 2  |  macOS + CODEX"
print "WORKFLOW SIMULATION  |  NO ARC SCORE OR BENCHMARK CLAIM"
print "Waiting for the capability from Docker User 1..."

for attempt in {1..90}; do
  [[ -s "$url_file" ]] && break
  sleep 1
done

if [[ ! -s "$url_file" ]]; then
  print -u2 "No capability arrived within 90 seconds."
  exit 1
fi

share_url="$(<"$url_file")"
print
print "Capability received. Resuming the private Sailbox and pulling CAMP..."
node bin/passon.mjs pull "$share_url" --target codex

print
print "Issuing the User 2 responsibility receipt..."
node bin/passon.mjs accept "$share_url" \
  --actor "user-2-macos" \
  --harness "codex" \
  --goal "Continue the simulated interactive grid puzzle without losing the observed mechanics, tested actions, or remaining uncertainty." \
  --first-action "Compare the live state with User 1's final frame, restate both known mechanics, then isolate the purple tile with one controlled action."

print
print "ACCEPTED  User 2 can continue from the same sealed checkpoint."
print "Cleaning up the live Sailbox..."
node bin/passon.mjs terminate "$share_url"
rm -f "$url_file"
print "SAILBOX TERMINATED  The short-lived capability is no longer stored in demo output."
sleep 5

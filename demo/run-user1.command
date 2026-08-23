#!/bin/zsh
set -eu

script_dir="${0:A:h}"
repo_root="${script_dir:h}"

cd "$repo_root"
clear
print "RELAY  |  USER 1  |  DOCKER AGENT"
print "WORKFLOW SIMULATION  |  INVENTED ARC-AGI-3-LIKE PUZZLE"
print "NO ARC SCORE OR BENCHMARK CLAIM"
print "Creating a sealed continuation in a private Sailbox..."
print
docker compose -f demo/compose.yml run --rm user1
print
print "User 1 is complete. The capability has moved to macOS User 2."
sleep 4

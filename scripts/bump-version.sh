#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

current=$(node -p "require('./package.json').version")

if [ $# -ne 1 ]; then
  echo "Current version: $current"
  echo "Usage: scripts/bump-version.sh <version|patch|minor|major>"
  exit 1
fi

IFS=. read -r major minor patch <<< "${current%%-*}"

case "$1" in
  patch) next="$major.$minor.$((patch + 1))" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  major) next="$((major + 1)).0.0" ;;
  *) next="${1#v}" ;;
esac

if ! [[ "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: '$next' is not a valid version, expected something like 1.2.3" >&2
  exit 1
fi

if [ "$next" = "$current" ]; then
  echo "Error: version is already $current" >&2
  exit 1
fi

NEXT="$next" perl -0pi -e 's/"version": "[^"]*"/"version": "$ENV{NEXT}"/' package.json src-tauri/tauri.conf.json
NEXT="$next" perl -0pi -e 's/^version = "[^"]*"/version = "$ENV{NEXT}"/m' src-tauri/Cargo.toml
NEXT="$next" perl -0pi -e 's/(name = "readme-viewer"\nversion = )"[^"]*"/$1"$ENV{NEXT}"/' src-tauri/Cargo.lock

echo "Bumped $current -> $next in package.json, tauri.conf.json, Cargo.toml and Cargo.lock"
echo "Next: commit and push, then run scripts/release-tag.sh"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
tag="v$version"

if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
  echo "Error: tag $tag already exists locally" >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag" > /dev/null; then
  echo "Error: tag $tag already exists on origin" >&2
  exit 1
fi

for file in src-tauri/tauri.conf.json src-tauri/Cargo.toml; do
  if ! grep -q "\"$version\"" "$file"; then
    echo "Error: $file doesn't have version $version, run scripts/bump-version.sh $version first" >&2
    exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: you have uncommitted changes, commit them before tagging" >&2
  exit 1
fi

git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}')" ]; then
  echo "Error: your branch isn't in sync with origin, push or pull first" >&2
  exit 1
fi

git tag -a "$tag" -m "$tag"
git push origin "$tag"

echo "Pushed $tag. The release workflow is running now, follow it with: gh run watch"

#!/usr/bin/env bash
#
# Prove a built IPA actually contains its configuration before submitting it.
#
#   tools/verify-ipa-bundle.sh path/to/build.ipa
#
# EXPO_PUBLIC_* values are inlined into the Hermes bundle as string literals at
# build time, so their presence is directly checkable in the artifact — no
# device needed. This is the exact inspection that diagnosed the build-3
# rejection (2.1a, blank screen): the reviewed bundle contained the "missing
# env" error strings and none of the real hosts. Run this on every production
# IPA before it goes to App Store Connect; docs/SUBMISSION_CHECKLIST.md lists
# it as a mandatory step.
#
# Note for future spelunking: Hermes stores strings containing non-ASCII (like
# the em-dashes in our error messages) as UTF-16, which `strings`/`grep -a`
# won't find. Everything asserted here is pure ASCII, so plain grep is enough.

set -euo pipefail

IPA="${1:-}"
if [[ -z "$IPA" || ! -f "$IPA" ]]; then
  echo "usage: $0 path/to/build.ipa" >&2
  exit 2
fi

# What a healthy production bundle must contain. Substrings, not full values —
# enough to prove the right literal was inlined without pinning this script to
# a rotatable key.
REQUIRED=(
  "majlrfbipzwrbvudwmoj.supabase.co"   # EXPO_PUBLIC_SUPABASE_URL
  "gymsync-api.fly.dev"                # EXPO_PUBLIC_API_URL
  "ingest.us.sentry.io"                # EXPO_PUBLIC_SENTRY_DSN
  "apps.googleusercontent.com"         # EXPO_PUBLIC_GOOGLE_*_CLIENT_ID
)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

unzip -q "$IPA" -d "$TMP"
BUNDLE="$(find "$TMP/Payload" -name main.jsbundle -maxdepth 2 | head -1)"
if [[ -z "$BUNDLE" ]]; then
  echo "FAIL: no main.jsbundle inside $IPA — not a release build?" >&2
  exit 1
fi

# Hermes bytecode magic: c6 1f bc 03. A plain-JS bundle here would mean the
# build pipeline changed underneath us — worth a human look either way.
MAGIC="$(xxd -p -l 4 "$BUNDLE")"
if [[ "$MAGIC" != "c61fbc03" ]]; then
  echo "WARN: bundle is not Hermes bytecode (magic: $MAGIC) — checking anyway" >&2
fi

FAILED=0
for literal in "${REQUIRED[@]}"; do
  # grep -c counts matching *lines*; one line is enough to prove inlining.
  if [[ "$(grep -ac "$literal" "$BUNDLE")" -eq 0 ]]; then
    echo "FAIL: '$literal' not found in bundle — its env var was undefined at build time" >&2
    FAILED=1
  else
    echo "ok: $literal"
  fi
done

# The dev fallback host must never be the bundle's ONLY supabase host.
if [[ "$(grep -ac "placeholder.supabase.co" "$BUNDLE")" -gt 0 \
   && "$(grep -ac "majlrfbipzwrbvudwmoj.supabase.co" "$BUNDLE")" -eq 0 ]]; then
  echo "FAIL: bundle only knows the placeholder Supabase host" >&2
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "" >&2
  echo "This IPA would show the config-error screen on launch. Do NOT submit it." >&2
  echo "Fix the EAS environment variables and rebuild — see docs/DEPLOY.md." >&2
  exit 1
fi

echo "PASS: $IPA contains all required configuration"

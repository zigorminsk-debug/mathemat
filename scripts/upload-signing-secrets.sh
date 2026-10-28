#!/usr/bin/env bash
# Use only with a trusted GitHub login that can manage Actions secrets.
# Values are read from files, never printed or passed as command-line arguments.
set -euo pipefail
cd "$(dirname "$0")/.."
private_dir="${1:-.signing}"
repo="${2:-zigorminsk-debug/mathemat}"
for file in mathemat-release.p12 ANDROID_KEYSTORE_PASSWORD.txt ANDROID_KEYSTORE_BASE64.txt; do
  [[ -s "$private_dir/$file" ]] || { echo "Missing: $private_dir/$file" >&2; exit 1; }
done
actual="$(openssl pkcs12 -in "$private_dir/mathemat-release.p12" -passin "file:$private_dir/ANDROID_KEYSTORE_PASSWORD.txt" -clcerts -nokeys 2>/dev/null | openssl x509 -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
expected="$(tr -d ':[:space:]' < signing-cert.sha256 | tr '[:upper:]' '[:lower:]')"
[[ -n "$actual" && "$actual" == "$expected" ]] || { echo 'The signing certificate does not match signing-cert.sha256; refusing to overwrite secrets.' >&2; exit 1; }
# Ensure the Base64 file represents exactly the verified keystore.
cmp -s <(base64 -d < "$private_dir/ANDROID_KEYSTORE_BASE64.txt") "$private_dir/mathemat-release.p12" || { echo 'Base64 content does not match the keystore.' >&2; exit 1; }
gh secret set ANDROID_KEYSTORE_BASE64 --repo "$repo" < "$private_dir/ANDROID_KEYSTORE_BASE64.txt"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$repo" < "$private_dir/ANDROID_KEYSTORE_PASSWORD.txt"
echo 'Signing secrets configured. Keep a secure offline backup of the keystore and password.'

#!/bin/sh
# Deploys one or more component services to the relay, from a CI runner.
#
#   deploy-service.sh <tag> <service> [service...]
#
# Several services are deployed in order, so a component whose containers must
# move together can be released in one call.
#
# What it does, in order:
#   1. Writes the key to a private temp file and removes it on exit, so a later
#      step cannot read it and a failed run leaves nothing behind.
#   2. Reaches the relay over an IAP tunnel, so the host never exposes SSH.
#   3. Verifies the host key against relay_known_hosts and refuses to connect
#      otherwise, which is what makes the tunnel trustworthy.
#   4. Lets the host verify actual containers under its cross-repository lock.
#      A matching tag alone is not evidence of a healthy running container.
#
# Environment:
#   RELAY_SSH_KEY   path to the private key file      (required)
#   RELAY_SSH_USER  login user on the relay           (default: runner)
#   PROJECT, ZONE, VM                                 (defaults below)
set -eu

VM="${VM:-derouter-relay}"
ZONE="${ZONE:-us-east1-c}"
PROJECT="${PROJECT:-alphafox-506201}"
DEST="${DEST:-/opt/derouter}"
USER_NAME="${RELAY_SSH_USER:-runner}"

TAG=${1:-}
shift 2>/dev/null || true
if [ -z "$TAG" ] || [ "$#" -eq 0 ]; then
  echo "usage: $0 <tag> <service> [service...]" >&2
  exit 2
fi
for svc in "$@"; do
  case "$svc" in
    *[!a-z-]*) echo "deploy: service '$svc' must be lowercase letters and hyphens" >&2; exit 2 ;;
  esac
done
case "$TAG" in
  *[!A-Za-z0-9._-]*) echo "deploy: tag has characters a docker tag cannot carry" >&2; exit 2 ;;
esac
: "${RELAY_SSH_KEY:?RELAY_SSH_KEY is required}"

# This script ships inside a component's scripts/ directory while relay_known_hosts
# sits at its repository root, so look beside the script first and then one level up.
here=$(cd "$(dirname "$0")" && pwd)
known="$here/relay_known_hosts"
[ -f "$known" ] || known="$here/../relay_known_hosts"
if [ ! -f "$known" ]; then
  echo "deploy: relay_known_hosts not found beside $here or one level up" >&2
  exit 1
fi
work=$(mktemp -d)
cleanup() { rm -rf "$work"; }
trap cleanup EXIT INT TERM

install -m 600 "$RELAY_SSH_KEY" "$work/id"
grep -E "ssh-ed25519|ssh-rsa" "$known" > "$work/known_hosts"

cat > "$work/config" <<EOF
Host relay
  HostName $VM
  User $USER_NAME
  IdentityFile $work/id
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking yes
  UserKnownHostsFile $work/known_hosts
  CheckHostIP no
  ProxyCommand gcloud compute start-iap-tunnel $VM 22 --listen-on-stdin --project=$PROJECT --zone=$ZONE --verbosity=warning
EOF
chmod 600 "$work/config"

relay_ssh() { ssh -F "$work/config" relay "$1"; }

for svc in "$@"; do
  echo "deploy: requesting $svc $TAG"
  relay_ssh "sudo sh $DEST/set-image-tag.sh $svc $TAG"
done

#!/usr/bin/env bash
set -euo pipefail

# Creates the one AgentCore Memory resource `LayalgaHouseholdMemory` (or
# prints the existing id if a memory of that name already exists), polls
# until it reaches ACTIVE, and prints `MEMORY_ID=<id>` on success.
#
# Strategies (see docs/plans/2026-09-03-hackathon-final-stretch-phases/phase-3.md):
#   - HouseholdPreferences (userPreferenceMemoryStrategy),
#     namespaceTemplates: /parties/{actorId}/preferences
#   - HouseholdFacts (semanticMemoryStrategy),
#     namespaceTemplates: /parties/{actorId}/facts
# `eventExpiryDuration` is 30 (days). `{actorId}` resolves at extraction
# time to `home-<homeId>` or `home-<homeId>/party-<partyId>`
# (`src/agent/memory.ts`), never a name.
#
# Idempotent by name: `aws bedrock-agentcore-control get-memory` after a
# `ResourceAlreadyExists`-style failure is not attempted here because the
# service does not expose a get-by-name lookup; instead this script first
# lists memories and reuses one whose name matches before creating a new
# one, so running it again after success is a no-op.

usage() {
  cat <<'USAGE'
Usage: create-memory.sh [options]

Options:
  --profile <name>     AWS CLI profile to use (default: archy)
  --region <region>     AWS region (default: us-east-1)
  --name <name>          Memory resource name (default: LayalgaHouseholdMemory)
  --poll-interval <sec>  Seconds between ACTIVE polls (default: 15)
  --poll-timeout <sec>   Maximum seconds to wait for ACTIVE (default: 300)
USAGE
}

profile="${AWS_PROFILE:-archy}"
region="${AWS_REGION:-us-east-1}"
memory_name="LayalgaHouseholdMemory"
poll_interval=15
poll_timeout=300

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      profile="${2:?--profile requires a value}"
      shift 2
      ;;
    --region)
      region="${2:?--region requires a value}"
      shift 2
      ;;
    --name)
      memory_name="${2:?--name requires a value}"
      shift 2
      ;;
    --poll-interval)
      poll_interval="${2:?--poll-interval requires a value}"
      shift 2
      ;;
    --poll-timeout)
      poll_timeout="${2:?--poll-timeout requires a value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

aws_args=(--profile "$profile" --region "$region")

echo "Checking for an existing memory named $memory_name..." >&2
existing_id="$(aws bedrock-agentcore-control list-memories "${aws_args[@]}" --output json \
  | jq -r --arg name "$memory_name" '.memories[]? | select(.name == $name) | .id' | head -n1)"

if [[ -n "$existing_id" ]]; then
  memory_id="$existing_id"
  echo "Reusing existing memory: $memory_id" >&2
else
  strategies_file="$(mktemp "${TMPDIR:-/tmp}/layalga-memory-strategies.XXXXXX.json")"
  trap 'rm -f -- "$strategies_file"' EXIT

  jq -n '[
    {
      userPreferenceMemoryStrategy: {
        name: "HouseholdPreferences",
        namespaceTemplates: ["/parties/{actorId}/preferences"]
      }
    },
    {
      semanticMemoryStrategy: {
        name: "HouseholdFacts",
        namespaceTemplates: ["/parties/{actorId}/facts"]
      }
    }
  ]' >"$strategies_file"

  echo "Creating memory $memory_name..." >&2
  memory_id="$(aws bedrock-agentcore-control create-memory \
    --name "$memory_name" \
    --event-expiry-duration 30 \
    --memory-strategies "file://$strategies_file" \
    "${aws_args[@]}" \
    --output json | jq -r '.memory.id')"

  if [[ -z "$memory_id" || "$memory_id" == "null" ]]; then
    echo "Error: create-memory did not return a memory id" >&2
    exit 1
  fi
fi

echo "Waiting for $memory_id to become ACTIVE (timeout ${poll_timeout}s)..." >&2
elapsed=0
status=""
while (( elapsed < poll_timeout )); do
  status="$(aws bedrock-agentcore-control get-memory \
    --memory-id "$memory_id" \
    "${aws_args[@]}" \
    --output json | jq -r '.memory.status')"
  if [[ "$status" == "ACTIVE" ]]; then
    break
  fi
  if [[ "$status" == "FAILED" ]]; then
    echo "Error: memory $memory_id reached FAILED status" >&2
    exit 1
  fi
  echo "  status=$status, waiting ${poll_interval}s (elapsed ${elapsed}s)..." >&2
  sleep "$poll_interval"
  elapsed=$((elapsed + poll_interval))
done

if [[ "$status" != "ACTIVE" ]]; then
  echo "Error: memory $memory_id did not reach ACTIVE within ${poll_timeout}s (last status: $status)" >&2
  exit 1
fi

echo "Memory $memory_id is ACTIVE." >&2
echo "MEMORY_ID=$memory_id"

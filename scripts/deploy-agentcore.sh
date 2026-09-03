#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

profile=""
region="us-east-1"
env_file="$repository_root/.env.agentcore"
runtime_name="layalga_agent"
skip_bundle="false"

usage() {
  cat <<'USAGE'
Usage: deploy-agentcore.sh --profile <name> [options]

Options:
  --profile <name>       AWS CLI profile to use (required)
  --region <region>       AWS region (default: us-east-1)
  --env-file <path>       Runtime env file (default: .env.agentcore at the project root)
  --runtime-name <name>   AgentCore runtime name (default: layalga_agent)
  --skip-bundle           Reuse the existing dist/deployment_package.zip
USAGE
}

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
    --env-file)
      env_file="${2:?--env-file requires a value}"
      shift 2
      ;;
    --runtime-name)
      runtime_name="${2:?--runtime-name requires a value}"
      shift 2
      ;;
    --skip-bundle)
      skip_bundle="true"
      shift
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

if [[ -z "$profile" ]]; then
  echo "Error: --profile is required" >&2
  usage >&2
  exit 1
fi

aws_args=(--profile "$profile" --region "$region")
bucket="layalga-agent-bundles-106403001709"
s3_key="agentcore/deployment_package.zip"
bundle_zip="$repository_root/dist/deployment_package.zip"
role_arn="arn:aws:iam::106403001709:role/layalga-agentcore-runtime"

required_keys=(
  DATABASE_URL
  BEDROCK_MODEL_ID
  AWS_REGION
  MODEL
  APP_URL
  LINK_TOKEN_SECRET
  CALENDAR_FEED_SECRET
)

env_json_file=""
cleanup() {
  if [[ -n "$env_json_file" && -f "$env_json_file" ]]; then
    rm -f -- "$env_json_file"
  fi
}
trap cleanup EXIT

if [[ "$skip_bundle" != "true" ]]; then
  echo "Building agent bundle..." >&2
  (cd "$repository_root" && pnpm run agent:bundle)
fi

if [[ ! -f "$bundle_zip" ]]; then
  echo "Error: deployment package not found at $bundle_zip" >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "Error: env file not found: $env_file" >&2
  exit 1
fi

env_json_file="$(mktemp "${TMPDIR:-/tmp}/layalga-agentcore-env.XXXXXX.json")"

# Build the environment JSON with jq, streaming the file through -R so no
# value is ever passed as a CLI argument or echoed to the terminal.
jq -Rn '
  [inputs
    | select(length > 0)
    | select(startswith("#") | not)
    | capture("^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$")
    | .value |= (
        if (startswith("\"") and endswith("\"") and length >= 2)
        then .[1:-1]
        else .
        end
      )
  ]
  | from_entries
' "$env_file" > "$env_json_file"

missing_key=""
for key in "${required_keys[@]}"; do
  if ! jq -e --arg key "$key" 'has($key)' "$env_json_file" >/dev/null; then
    missing_key="$key"
    break
  fi
done
if [[ -n "$missing_key" ]]; then
  echo "Error: missing required env key: $missing_key" >&2
  exit 1
fi

echo "Runtime environment keys:" >&2
jq -r 'keys | sort | .[]' "$env_json_file" | sed 's/^/  /' >&2

runtime_env="$(jq -c '.' "$env_json_file")"

echo "Uploading deployment package to s3://$bucket/$s3_key..." >&2
put_object_output="$(aws s3api put-object \
  --bucket "$bucket" \
  --key "$s3_key" \
  --body "$bundle_zip" \
  "${aws_args[@]}")"
s3_version_id="$(printf '%s' "$put_object_output" | jq -r '.VersionId')"
if [[ -z "$s3_version_id" || "$s3_version_id" == "null" ]]; then
  echo "Error: S3 upload did not return a VersionId (is bucket versioning enabled?)" >&2
  exit 1
fi
echo "Uploaded S3 object version: $s3_version_id" >&2

artifact_json="$(jq -cn \
  --arg bucket "$bucket" \
  --arg prefix "$s3_key" \
  --arg versionId "$s3_version_id" \
  '{
    codeConfiguration: {
      code: {
        s3: { bucket: $bucket, prefix: $prefix, versionId: $versionId }
      },
      runtime: "NODE_22",
      entryPoint: ["app.js"]
    }
  }')"

existing_runtime_id="$(aws bedrock-agentcore-control list-agent-runtimes \
  "${aws_args[@]}" \
  --output json \
  | jq -r --arg name "$runtime_name" \
    '.agentRuntimes[]? | select(.agentRuntimeName == $name) | .agentRuntimeId' \
  | head -n 1)"

# Flags shared by create-agent-runtime and update-agent-runtime; only the
# subcommand and its identifying flag (--agent-runtime-name vs
# --agent-runtime-id) differ between the two branches below.
common_args=(
  --agent-runtime-artifact "$artifact_json"
  --role-arn "$role_arn"
  --network-configuration '{"networkMode":"PUBLIC"}'
  --protocol-configuration '{"serverProtocol":"HTTP"}'
  --lifecycle-configuration '{"idleRuntimeSessionTimeout":300,"maxLifetime":1800}'
  --environment-variables "file://$env_json_file"
  --description "L Ayalga production agent runtime"
  "${aws_args[@]}"
  --output json
)

if [[ -z "$existing_runtime_id" ]]; then
  echo "Creating agent runtime $runtime_name..." >&2
  create_output="$(aws bedrock-agentcore-control create-agent-runtime \
    --agent-runtime-name "$runtime_name" \
    "${common_args[@]}")"
  agent_runtime_id="$(printf '%s' "$create_output" | jq -r '.agentRuntimeId')"
else
  echo "Updating agent runtime $runtime_name ($existing_runtime_id)..." >&2
  update_output="$(aws bedrock-agentcore-control update-agent-runtime \
    --agent-runtime-id "$existing_runtime_id" \
    "${common_args[@]}")"
  agent_runtime_id="$(printf '%s' "$update_output" | jq -r '.agentRuntimeId')"
fi

if [[ -z "$agent_runtime_id" || "$agent_runtime_id" == "null" ]]; then
  echo "Error: could not determine agentRuntimeId" >&2
  exit 1
fi

echo "Waiting for agent runtime $agent_runtime_id to become READY..." >&2
deadline=$((SECONDS + 600))
status=""
agent_runtime_arn=""
agent_runtime_version=""
while (( SECONDS < deadline )); do
  get_output="$(aws bedrock-agentcore-control get-agent-runtime \
    --agent-runtime-id "$agent_runtime_id" \
    "${aws_args[@]}" \
    --output json)"
  status="$(printf '%s' "$get_output" | jq -r '.status')"
  agent_runtime_arn="$(printf '%s' "$get_output" | jq -r '.agentRuntimeArn')"
  agent_runtime_version="$(printf '%s' "$get_output" | jq -r '.agentRuntimeVersion')"
  if [[ "$status" == "READY" ]]; then
    break
  fi
  if [[ "$status" == *FAILED* ]]; then
    echo "Error: agent runtime reached status $status" >&2
    exit 1
  fi
  sleep 10
done

if [[ "$status" != "READY" ]]; then
  echo "Error: agent runtime did not reach READY within 10 minutes (last status: $status)" >&2
  exit 1
fi

jq -cn \
  --arg agentRuntimeArn "$agent_runtime_arn" \
  --arg agentRuntimeId "$agent_runtime_id" \
  --arg agentRuntimeVersion "$agent_runtime_version" \
  --arg s3Key "$s3_key" \
  --arg s3VersionId "$s3_version_id" \
  '{
    agentRuntimeArn: $agentRuntimeArn,
    agentRuntimeId: $agentRuntimeId,
    agentRuntimeVersion: $agentRuntimeVersion,
    s3Key: $s3Key,
    s3VersionId: $s3VersionId
  }'

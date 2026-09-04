#!/usr/bin/env bash
set -euo pipefail

# Enables CloudWatch Transaction Search once at the account level, and sets
# the retention on the AgentCore runtime's own log group. Idempotent: every
# step is a create-or-update against a fixed, well-known name, so running
# this script again after it has already succeeded is a no-op change.
#
# Equivalent to the two CloudFormation resources AWS documents for
# Transaction Search (AWS::Logs::ResourcePolicy and
# AWS::XRay::TransactionSearchConfig):
# https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search-Cloudformation.html
#
# 1. A CloudWatch Logs resource policy that lets the xray.amazonaws.com
#    service principal write spans into the aws/spans and
#    /aws/application-signals/data log groups (`aws logs
#    put-resource-policy`). This is a CloudWatch Logs API despite granting
#    access to X-Ray; there is no separate "X-Ray resource policy" API for
#    this purpose.
# 2. `aws xray update-trace-segment-destination --destination
#    CloudWatchLogs`, so PutTraceSegments delivers to CloudWatch Logs
#    instead of classic X-Ray storage.
# 3. `aws xray update-indexing-rule` on the account's existing indexing
#    rule, raised to 100 percent sampling for the demo.
#
# Then, separately, `aws logs put-retention-policy` on the AgentCore
# runtime's own log group, since spans and prompt/tool text otherwise
# retain indefinitely.

usage() {
  cat <<'USAGE'
Usage: enable-transaction-search.sh --profile <name> --runtime-id <id> [options]

Options:
  --profile <name>          AWS CLI profile to use (required)
  --runtime-id <id>         AgentCore runtime id, e.g. layalga_agent-XXXXXXXXXX
                             (required; used to derive the runtime log group)
  --region <region>         AWS region (default: us-east-1)
  --retention-days <days>   Log group retention in days (default: 14)
USAGE
}

profile=""
runtime_id=""
region="us-east-1"
retention_days="14"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      profile="${2:?--profile requires a value}"
      shift 2
      ;;
    --runtime-id)
      runtime_id="${2:?--runtime-id requires a value}"
      shift 2
      ;;
    --region)
      region="${2:?--region requires a value}"
      shift 2
      ;;
    --retention-days)
      retention_days="${2:?--retention-days requires a value}"
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

if [[ -z "$profile" ]]; then
  echo "Error: --profile is required" >&2
  usage >&2
  exit 1
fi
if [[ -z "$runtime_id" ]]; then
  echo "Error: --runtime-id is required" >&2
  usage >&2
  exit 1
fi

aws_args=(--profile "$profile" --region "$region")
log_group_name="/aws/bedrock-agentcore/runtimes/${runtime_id}-DEFAULT"

policy_document_file=""
cleanup() {
  if [[ -n "$policy_document_file" && -f "$policy_document_file" ]]; then
    rm -f -- "$policy_document_file"
  fi
}
trap cleanup EXIT

policy_document_file="$(mktemp "${TMPDIR:-/tmp}/layalga-transaction-search-policy.XXXXXX.json")"
account_id="$(aws sts get-caller-identity "${aws_args[@]}" --output json | jq -r '.Account')"
if [[ -z "$account_id" || "$account_id" == "null" ]]; then
  echo "Error: could not determine the account id from sts get-caller-identity" >&2
  exit 1
fi
partition="aws"

jq -n \
  --arg partition "$partition" \
  --arg region "$region" \
  --arg account "$account_id" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "TransactionSearchXRayAccess",
        Effect: "Allow",
        Principal: { Service: "xray.amazonaws.com" },
        Action: "logs:PutLogEvents",
        Resource: [
          "arn:\($partition):logs:\($region):\($account):log-group:aws/spans:*",
          "arn:\($partition):logs:\($region):\($account):log-group:/aws/application-signals/data:*"
        ],
        Condition: {
          ArnLike: { "aws:SourceArn": "arn:\($partition):xray:\($region):\($account):*" },
          StringEquals: { "aws:SourceAccount": $account }
        }
      }
    ]
  }' > "$policy_document_file"

echo "Step 1/4: CloudWatch Logs resource policy granting xray.amazonaws.com write access..." >&2
aws logs put-resource-policy \
  --policy-name TransactionSearchAccess \
  --policy-document "file://$policy_document_file" \
  "${aws_args[@]}" \
  --output json >&2

echo "Step 2/4: X-Ray trace segment destination -> CloudWatchLogs..." >&2
aws xray update-trace-segment-destination \
  --destination CloudWatchLogs \
  "${aws_args[@]}" \
  --output json >&2

echo "Step 3/4: X-Ray indexing rule -> 100 percent sampling..." >&2
indexing_rule_name="$(aws xray get-indexing-rules "${aws_args[@]}" --output json \
  | jq -r '.IndexingRules[0].Name // empty')"
if [[ -z "$indexing_rule_name" ]]; then
  echo "Error: no X-Ray indexing rule found; enable Transaction Search once via the console first, or confirm the account has an indexing rule" >&2
  exit 1
fi
aws xray update-indexing-rule \
  --name "$indexing_rule_name" \
  --rule 'Probabilistic={DesiredSamplingPercentage=100}' \
  "${aws_args[@]}" \
  --output json >&2

# 100 percent sampling is for the demo, so every run is visible in
# CloudWatch GenAI Observability. After judging, lower cost by rerunning
# this step with a smaller --rule percentage (e.g. 5), or leave the
# indexing rule as-is and instead switch the runtime's own
# OTEL_TRACES_SAMPLER to parentbased_traceidratio with
# OTEL_TRACES_SAMPLER_ARG=0.05 (see scripts/deploy-agentcore.sh) to sample
# fewer traces from the application side.

echo "Step 4/4: log group retention on $log_group_name -> ${retention_days} days..." >&2
aws logs put-retention-policy \
  --log-group-name "$log_group_name" \
  --retention-in-days "$retention_days" \
  "${aws_args[@]}"

echo "Transaction Search enabled; $log_group_name retention set to ${retention_days} days." >&2

#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_adr="$repository_root/docs/decisions/0002-agent-runtime.md"

# Phase 0 selected the local runtime. Check this before every AWS command so
# running the Phase 4 bootstrap is a safe, documented no-op for that verdict.
if grep -Eq 'Use the local Next\.js runtime path|AGENT_RUNTIME=local' "$runtime_adr"; then
  echo "SKIP: Phase 0 selected AGENT_RUNTIME=local; no Scheduler, SQS, or IAM resources were created."
  exit 0
fi

: "${AGENTCORE_RUNTIME_ARN:?AGENTCORE_RUNTIME_ARN is required for the AgentCore scheduler path}"

aws_profile="${AWS_PROFILE:-archy}"
aws_region="${AWS_REGION:-us-east-1}"
role_name="layalga-scheduler-invoke"
policy_name="layalga-scheduler-invoke"
queue_name="layalga-scheduler-dlq"
aws_args=(--profile "$aws_profile" --region "$aws_region")

if ! queue_url="$(aws sqs get-queue-url \
  --queue-name "$queue_name" \
  --query QueueUrl \
  --output text \
  "${aws_args[@]}" 2>/dev/null)"; then
  queue_url="$(aws sqs create-queue \
    --queue-name "$queue_name" \
    --query QueueUrl \
    --output text \
    "${aws_args[@]}")"
fi

queue_arn="$(aws sqs get-queue-attributes \
  --queue-url "$queue_url" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text \
  "${aws_args[@]}")"

trust_policy="file://$repository_root/infra/iam/scheduler-invoke-trust.json"
if aws iam get-role --role-name "$role_name" "${aws_args[@]}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "$role_name" \
    --policy-document "$trust_policy" \
    "${aws_args[@]}"
else
  aws iam create-role \
    --role-name "$role_name" \
    --assume-role-policy-document "$trust_policy" \
    "${aws_args[@]}" >/dev/null
fi

temporary_dir="$(mktemp -d)"
rendered_policy="$temporary_dir/scheduler-invoke-policy.json"
cleanup() {
  rm -f "$rendered_policy"
  rmdir "$temporary_dir"
}
trap cleanup EXIT

jq \
  --arg runtime_arn "$AGENTCORE_RUNTIME_ARN" \
  --arg dlq_arn "$queue_arn" \
  '(.Statement[] | select(.Sid == "InvokeLayalgaAgentRuntime") | .Resource) = [$runtime_arn, ($runtime_arn + "/*")]
   | (.Statement[] | select(.Sid == "SendSchedulerFailuresToDlq") | .Resource) = $dlq_arn' \
  "$repository_root/infra/iam/scheduler-invoke-policy.json" >"$rendered_policy"

aws iam put-role-policy \
  --role-name "$role_name" \
  --policy-name "$policy_name" \
  --policy-document "file://$rendered_policy" \
  "${aws_args[@]}"

role_arn="$(aws iam get-role \
  --role-name "$role_name" \
  --query Role.Arn \
  --output text \
  "${aws_args[@]}")"

echo "SCHEDULER_ROLE_ARN=$role_arn"
echo "SCHEDULER_DLQ_ARN=$queue_arn"

#!/usr/bin/env bash
# Deploy the CDK backend and, when configured locally, the AgentCore relay.
# Run from the repository root: ./scripts/deploy.sh

set -euo pipefail

DEPLOY_REGION="us-east-1"
DEPLOY_PROFILE="${AWS_PROFILE:-}"
DEPLOY_LEGACY_AGENTCORE="${DEPLOY_LEGACY_AGENTCORE:-false}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTCORE_CONFIG="$REPO_ROOT/backend/voice_agent/.bedrock_agentcore.yaml"

command -v aws >/dev/null || { echo "AWS CLI is required."; exit 1; }
command -v npm >/dev/null || { echo "npm is required."; exit 1; }
[ -n "$DEPLOY_PROFILE" ] || {
  echo "Set AWS_PROFILE to the deployment profile before running this script."
  exit 1
}

echo "Checking AWS identity for profile '$DEPLOY_PROFILE'..."
DEPLOY_ACCOUNT="$(aws sts get-caller-identity \
  --profile "$DEPLOY_PROFILE" \
  --query Account \
  --output text)"
echo "Deploying to account $DEPLOY_ACCOUNT in $DEPLOY_REGION."

# Validate every requested deployment boundary before mutating AWS state. This
# avoids successfully deploying CDK and then failing an optional AgentCore step.
if [[ "$DEPLOY_LEGACY_AGENTCORE" == "true" ]]; then
  if ! command -v agentcore >/dev/null; then
    echo "AgentCore CLI is not installed; cannot deploy the requested legacy voice relay."
    exit 1
  fi
  # Let grep consume the full help output. With pipefail, grep -q can close the
  # pipe early and make a matching CLI look invalid when agentcore gets SIGPIPE.
  if ! agentcore --help 2>&1 | grep "Configuration management" >/dev/null; then
    echo "The installed AgentCore CLI does not match the legacy Starter Toolkit expected by this script."
    echo "Follow backend/voice_agent/README.md to migrate instead of mixing CLI formats."
    exit 1
  fi
  if [[ ! -f "$AGENTCORE_CONFIG" ]]; then
    echo "Missing $AGENTCORE_CONFIG. Run the legacy AgentCore configure step for this account first."
    exit 1
  fi

  CONFIG_ACCOUNT="$(awk '$1 == "account:" { print $2; exit }' "$AGENTCORE_CONFIG")"
  CONFIG_REGION="$(awk '$1 == "region:" { print $2; exit }' "$AGENTCORE_CONFIG")"
  if [[ -z "$CONFIG_ACCOUNT" || -z "$CONFIG_REGION" ]]; then
    echo "AgentCore config is missing its account or region; refusing deployment."
    exit 1
  fi
  if [[ "$CONFIG_ACCOUNT" != "$DEPLOY_ACCOUNT" || "$CONFIG_REGION" != "$DEPLOY_REGION" ]]; then
    echo "AgentCore config targets $CONFIG_ACCOUNT/$CONFIG_REGION, not $DEPLOY_ACCOUNT/$DEPLOY_REGION."
    echo "Re-run legacy AgentCore configuration with profile '$DEPLOY_PROFILE' before deploying."
    exit 1
  fi
fi

echo "Deploying the Lambda and S3 backend with CDK..."
(
  cd "$REPO_ROOT/infrastructure"
  npm ci
  npm run build
  npx cdk deploy \
    --profile "$DEPLOY_PROFILE" \
    --require-approval never
)

if [[ "$DEPLOY_LEGACY_AGENTCORE" != "true" ]]; then
  echo "Skipping the legacy AgentCore deployment (opt in with DEPLOY_LEGACY_AGENTCORE=true)."
  echo "See backend/voice_agent/README.md before choosing or migrating AgentCore CLI formats."
else
  echo "Deploying the AgentCore voice relay..."
  (
    cd "$REPO_ROOT/backend/voice_agent"
    AWS_PROFILE="$DEPLOY_PROFILE" \
    AWS_REGION="$DEPLOY_REGION" \
    AGENTCORE_SUPPRESS_RECOMMENDATION=1 \
      agentcore deploy \
        -a mock-interview-voice-agent \
        --env AWS_REGION="$DEPLOY_REGION" \
        --env MODEL_ID=amazon.nova-2-sonic-v1:0
  )
fi

echo "Deployment step complete. Amplify Hosting and production authentication are separate setup steps."

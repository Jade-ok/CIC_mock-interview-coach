#!/usr/bin/env bash
# Deploy the Lambda/S3 backend with AWS CDK.
# Run from the repository root: ./scripts/deploy.sh

set -euo pipefail

DEPLOY_REGION="us-east-1"
DEPLOY_PROFILE="${AWS_PROFILE:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

echo "Deploying the Lambda and S3 backend with CDK..."
(
  cd "$REPO_ROOT/infrastructure"
  npm ci
  npm run build
  npx cdk deploy \
    --profile "$DEPLOY_PROFILE" \
    --require-approval never
)

echo "Backend deployment complete. AgentCore and Amplify use their own deployment workflows."

#!/bin/bash
# Deploy script for the Mock Interview Coach
# Run from the project root: ./scripts/deploy.sh
#
# Prerequisites:
#   - AWS CLI configured with credentials
#   - Docker running (for backend/voice_agent)
#   - agentcore CLI installed (pip3 install bedrock-agentcore-starter-toolkit)

set -e

REGION="us-east-1"
ACCOUNT_ID="002859476624"
S3_BUCKET="cic-mock-interview-configs-002859476624"
LAMBDA_ROLE="mock-interview-lambda-role"

echo "=========================================="
echo " Mock Interview Coach - Deployment Script"
echo "=========================================="
echo ""

# Check AWS credentials
echo "[1/6] Checking AWS credentials..."
aws sts get-caller-identity --region $REGION > /dev/null 2>&1 || {
    echo "ERROR: No AWS credentials found. Run 'aws configure' or export credentials."
    exit 1
}
echo "  ✓ Credentials OK ($(aws sts get-caller-identity --query 'Arn' --output text))"
echo ""

# Upload S3 configs
echo "[2/6] Uploading S3 interview configs..."
aws s3 cp backend/config/interview_structure.json \
    s3://$S3_BUCKET/interview_structure.json --region $REGION
aws s3 cp backend/config/student_interview_profile.json \
    s3://$S3_BUCKET/student_interview_profile.json --region $REGION
echo "  ✓ S3 configs uploaded to s3://$S3_BUCKET/"
echo ""

# Deploy Interviewer Lambda
echo "[3/6] Deploying Interviewer Lambda..."
rm -f interviewer.zip
(
    cd backend/functions/interviewer
    zip -r ../../../interviewer.zip . \
        -x ".env" "tests/*" "__pycache__/*" "*.pyc" > /dev/null
)

# Check if function exists
if aws lambda get-function --function-name mock-interview-interviewer --region $REGION > /dev/null 2>&1; then
    echo "  Function exists, updating code..."
    aws lambda update-function-code \
        --function-name mock-interview-interviewer \
        --zip-file fileb://interviewer.zip \
        --region $REGION > /dev/null
    aws lambda wait function-updated \
        --function-name mock-interview-interviewer \
        --region $REGION
    aws lambda update-function-configuration \
        --function-name mock-interview-interviewer \
        --handler handler.lambda_handler \
        --region $REGION > /dev/null
    aws lambda wait function-updated \
        --function-name mock-interview-interviewer \
        --region $REGION
else
    echo "  Creating new function..."
    aws lambda create-function \
        --function-name mock-interview-interviewer \
        --runtime python3.12 \
        --handler handler.lambda_handler \
        --zip-file fileb://interviewer.zip \
        --role "arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}" \
        --region $REGION \
        --timeout 30 \
        --environment "Variables={S3_BUCKET=$S3_BUCKET,INTERVIEW_STRUCTURE_KEY=interview_structure.json,INTERVIEW_PROFILE_KEY=student_interview_profile.json,AWS_REGION=$REGION}" \
        > /dev/null

    # Enable Function URL
    aws lambda create-function-url-config \
        --function-name mock-interview-interviewer \
        --auth-type NONE \
        --cors "AllowOrigins=*,AllowMethods=POST,AllowHeaders=content-type" \
        --region $REGION > /dev/null

    # Allow public access
    aws lambda add-permission \
        --function-name mock-interview-interviewer \
        --statement-id FunctionURLAllowPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal "*" \
        --function-url-auth-type NONE \
        --region $REGION > /dev/null 2>&1 || true
fi

LAMBDA_URL=$(aws lambda get-function-url-config --function-name mock-interview-interviewer --region $REGION --query 'FunctionUrl' --output text)
echo "  ✓ Interviewer Lambda deployed"
echo "  URL: $LAMBDA_URL"
rm -f interviewer.zip
echo ""

# Test Interviewer Lambda
echo "[4/6] Testing Interviewer Lambda (direct invoke)..."
aws lambda invoke \
    --function-name mock-interview-interviewer \
    --region $REGION \
    --cli-binary-format raw-in-base64-out \
    --payload '{"analyst_output":{"schema_version":"1.0","candidate_profile":{"candidate_level":"student_intern","education_summary":"CS","experience_summary":"intern","relevant_skills":["Python"],"experience_types_available":["internship"]},"target_role":{"title":"Intern","company":"Co","seniority":"intern","role_summary":"Build","required_skills":["Python"],"preferred_skills":[],"key_responsibilities":["Code"],"evaluation_priorities":["ownership"]},"resume_job_alignment":{"strong_matches":[],"partial_matches":[],"areas_to_explore":[]},"interview_plan":[],"selected_experiences":[],"analysis_warnings":[]}}' \
    /tmp/interviewer_test.json > /dev/null 2>&1

if grep -q '"success": true' /tmp/interviewer_test.json; then
    echo "  ✓ Lambda test passed (success: true)"
else
    echo "  ✗ Lambda test FAILED"
    cat /tmp/interviewer_test.json
    echo ""
fi
echo ""

# Deploy Voice Agent Server to AgentCore
echo "[5/6] Deploying Voice Agent Server to AgentCore Runtime..."
if command -v agentcore > /dev/null 2>&1; then
    cd backend/voice_agent
    AGENTCORE_SUPPRESS_RECOMMENDATION=1 agentcore deploy \
        -a mock-interview-voice-agent \
        --env AWS_REGION=$REGION \
        --env MODEL_ID=amazon.nova-2-sonic-v1:0 || {
        echo "  ✗ AgentCore deploy failed (check permissions)"
        echo "  You may need: bedrock-agentcore:CreateAgentRuntime permission"
    }
    cd ..
else
    echo "  ⚠ agentcore CLI not installed. Skipping voice agent deploy."
    echo "  Install: pip3 install --break-system-packages bedrock-agentcore-starter-toolkit"
fi
echo ""

# Summary
echo "[6/6] Deployment Summary"
echo "=========================================="
echo "  Region:           $REGION"
echo "  S3 Bucket:        s3://$S3_BUCKET/"
echo "  Interviewer URL:  $LAMBDA_URL"
echo "  Voice Agent:      (check agentcore status)"
echo ""
echo "  To test locally:"
echo "    aws lambda invoke --function-name mock-interview-interviewer \\"
echo "      --region $REGION --cli-binary-format raw-in-base64-out \\"
echo "      --payload '{\"analyst_output\":{...}}' /dev/stdout"
echo ""
echo "  To check voice agent status:"
echo "    cd backend/voice_agent && agentcore status"
echo "=========================================="

#!/usr/bin/env bash
# Build the Docker image with Cloud Build and deploy it to Cloud Run as a public service.
#
#   PROJECT_ID=my-project ./deploy/cloudrun.sh
#
# Optional: REGION (default europe-west2, London), SERVICE (default wind-forecast-monitor).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-europe-west2}"
SERVICE="${SERVICE:-wind-forecast-monitor}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Set PROJECT_ID or run 'gcloud config set project <id>'" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --source . \
  --port 8080 \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 40

gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" \
  --format 'value(status.url)'

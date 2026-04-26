#!/usr/bin/env bash
# deploy.sh — Manual one-shot deploy to Cloud Run (no CI/CD needed)
# Usage: ./deploy.sh <PROJECT_ID> [REGION]
set -euo pipefail

PROJECT_ID="${1:?Usage: ./deploy.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-south1}"
SERVICE="vertex-react-app"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE}/${SERVICE}"
IMAGE="${REPO}:$(git rev-parse --short HEAD 2>/dev/null || echo latest)"

echo "🚀  Deploying ${SERVICE} to Cloud Run"
echo "   Project : ${PROJECT_ID}"
echo "   Region  : ${REGION}"
echo "   Image   : ${IMAGE}"
echo ""

# ── 1. Enable APIs ─────────────────────────────────────────────────────────────
echo "▸ Enabling required APIs…"
gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# ── 2. Create Artifact Registry repo (idempotent) ─────────────────────────────
echo "▸ Creating Artifact Registry repo…"
gcloud artifacts repositories create "${SERVICE}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || true

# ── 3. Build & push image ─────────────────────────────────────────────────────
echo "▸ Building Docker image…"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build -t "${IMAGE}" -t "${REPO}:latest" .
docker push "${IMAGE}"
docker push "${REPO}:latest"

# ── 4. Create Service Account (idempotent) ────────────────────────────────────
echo "▸ Setting up service account…"
SA_EMAIL="vertex-react-sa@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create vertex-react-sa \
  --display-name="Vertex React App SA" \
  --project="${PROJECT_ID}" --quiet 2>/dev/null || true

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --quiet

# ── 5. Deploy to Cloud Run ────────────────────────────────────────────────────
echo "▸ Deploying to Cloud Run…"
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --no-cpu-throttling \
  --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=${REGION}" \
  --service-account="${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --quiet

echo ""
echo "✅  Deployed! Service URL:"
gcloud run services describe "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)"

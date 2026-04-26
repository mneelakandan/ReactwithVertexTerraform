# Vertex AI React App — Cloud Run

A full-stack React application that talks to **Google Vertex AI (Gemini)**, served by an Express backend, and deployed on **Cloud Run**.

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│   React Frontend (SPA)  │────▶│  Express Backend (/api)  │────▶│ Vertex AI (Gemini API)  │
│   Served by Express     │     │  Cloud Run container     │     │ Authenticated via SA    │
└─────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

---

## Project Structure

```
vertex-react-app/
├── src/                    # React frontend source
│   ├── App.js              # Main chat component
│   └── App.css             # Styles (terminal/industrial aesthetic)
├── public/                 # Static HTML
├── server.js               # Express backend (Vertex AI proxy)
├── package.json            # Frontend dependencies (React)
├── package-server.json     # Backend dependencies (Express, Vertex AI SDK)
├── Dockerfile              # Multi-stage: build React → serve with Node
├── .dockerignore
├── cloudbuild.yaml         # Cloud Build CI/CD pipeline
├── deploy.sh               # One-shot manual deploy script
├── .env.example            # Environment variable reference
└── terraform/
    └── main.tf             # IaC: Artifact Registry, Cloud Run, IAM, Build Trigger
```

---

## Local Development

### Prerequisites
- Node.js 20+
- GCP project with **Vertex AI API** enabled
- `gcloud` authenticated: `gcloud auth application-default login`

### 1. Install & run backend

```bash
cp .env.example .env
# Edit .env — set GCP_PROJECT_ID

cp package-server.json package.json.bak
cp package-server.json package.json
npm install

node server.js          # Runs on http://localhost:3001
```

### 2. Run React frontend

```bash
cp package.json.bak package.json
npm install
npm start               # Runs on http://localhost:3000
```

> The React app proxies API calls to `http://localhost:3001` via `REACT_APP_API_BASE_URL`.

---

## Deploy to Cloud Run

### Option A — One-shot script (quickest)

```bash
chmod +x deploy.sh
./deploy.sh YOUR_PROJECT_ID asia-south1
```

This will:
1. Enable required GCP APIs
2. Create Artifact Registry repo
3. Build & push the Docker image
4. Create a service account with `roles/aiplatform.user`
5. Deploy to Cloud Run with public access

### Option B — Terraform (recommended for teams)

```bash
cd terraform

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
project_id = "YOUR_PROJECT_ID"
region     = "asia-south1"
EOF

terraform init
terraform plan
terraform apply
```

### Option C — Cloud Build CI/CD (push to deploy)

1. Connect your GitHub repo in **Cloud Build > Triggers**
2. The `cloudbuild.yaml` pipeline triggers on every push to `main`
3. Or use Terraform to provision the trigger automatically

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `GCP_PROJECT_ID` | Backend | Your GCP project ID |
| `GCP_LOCATION` | Backend | Vertex AI region (default: `us-central1`) |
| `PORT` | Backend | Server port (Cloud Run sets this to `8080`) |
| `REACT_APP_API_BASE_URL` | Frontend | Backend URL (empty = same origin in prod) |

---

## Key Production Decisions

| Decision | Reasoning |
|---|---|
| `--no-cpu-throttling` | Prevents cold request latency for streaming Vertex AI responses |
| Multi-stage Dockerfile | Lean ~150MB image (only production deps in final stage) |
| Service Account per app | Least-privilege IAM instead of project-wide credentials |
| Artifact Registry over GCR | Recommended replacement for Container Registry |
| `min-instances=0` | Cost optimization; set to `1` to eliminate cold starts |

---

## Supported Models

| Model | Speed | Quality | Use case |
|---|---|---|---|
| `gemini-1.5-flash` | Fast | Good | Default, most queries |
| `gemini-1.5-pro` | Slower | Best | Complex reasoning |
| `gemini-2.0-flash-001` | Fastest | Very good | High-throughput |

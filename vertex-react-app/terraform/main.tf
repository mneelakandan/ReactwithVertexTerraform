################################################################################
# terraform/main.tf  — GCP Infrastructure for Vertex React App
################################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to store state in GCS (recommended for teams)
  # backend "gcs" {
  #   bucket = "your-tfstate-bucket"
  #   prefix = "vertex-react-app"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Variables ──────────────────────────────────────────────────────────────────
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "asia-south1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "vertex-react-app"
}

# ── Enable Required APIs ───────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Artifact Registry ──────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Docker images for ${var.service_name}"
  depends_on    = [google_project_service.apis]
}

# ── Service Account for Cloud Run ──────────────────────────────────────────────
resource "google_service_account" "run_sa" {
  account_id   = "vertex-react-sa"
  display_name = "Vertex React App — Cloud Run SA"
}

# Grant Vertex AI user role (to call Gemini)
resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.run_sa.email}"
}

# ── Cloud Run Service ──────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region

  template {
    service_account = google_service_account.run_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      # Image is updated by Cloud Build on each deploy
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}/${var.service_name}:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = false   # --no-cpu-throttling equivalent
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.repo,
  ]
}

# ── Allow public access ────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Cloud Build Trigger ────────────────────────────────────────────────────────
resource "google_cloudbuild_trigger" "main" {
  name        = "${var.service_name}-deploy"
  description = "Deploy on push to main"
  location    = "global"

  github {
    owner = "YOUR_GITHUB_USER"    # ← Replace
    name  = "vertex-react-app"    # ← Replace
    push {
      branch = "^main$"
    }
  }

  filename = "cloudbuild.yaml"

  substitutions = {
    _REGION  = var.region
    _SERVICE = var.service_name
    _REPO    = var.service_name
  }

  depends_on = [google_project_service.apis]
}

# ── Outputs ────────────────────────────────────────────────────────────────────
output "cloud_run_url" {
  description = "Public URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repo" {
  description = "Docker image path"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.service_name}/${var.service_name}"
}

output "service_account_email" {
  description = "Cloud Run service account"
  value       = google_service_account.run_sa.email
}

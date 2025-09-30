SHELL := /usr/bin/bash

# Helpers
.PHONY: help setup install test run migrate revision up down logs docker-build smoke clean env

help: ## Show this help
	@grep -E '^[a-zA-Z_\-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Create venv and install backend deps
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

install: setup ## Alias for setup

test: ## Run backend tests (unit/integration/e2e-lite)
	cd backend && . .venv/bin/activate && PYTHONPATH=./ pytest -q

run: ## Run backend locally with reload
	cd backend && . .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

migrate: ## Apply alembic migrations locally
	cd backend && . .venv/bin/activate && alembic upgrade head

revision: ## Create a new alembic revision, usage: make revision m="message"
	cd backend && . .venv/bin/activate && alembic revision -m "$(m)"

docker-build: ## Build docker images
	cd backend && docker compose build

up: ## Start docker-compose services
	cd backend && docker compose up -d

down: ## Stop docker-compose services
	cd backend && docker compose down

logs: ## Tail app logs
	cd backend && docker compose logs -f app

smoke: ## Simple smoke check against local server
	@echo "Health:"
	@curl -sf http://localhost:8000/health || true
	@echo
	@echo "Ready:"
	@curl -sf http://localhost:8000/ready || true

env: ## Copy backend env example if missing
	@if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; echo "Created backend/.env"; else echo "backend/.env exists"; fi

clean: ## Remove caches and temp artifacts
	# Python caches (bytecode, __pycache__, tool caches)
	find . -type d -name __pycache__ -exec rm -rf {} + || true
	find . -type f -name '*.py[co]' -delete || true
	rm -rf .pytest_cache backend/.pytest_cache || true
	rm -rf .mypy_cache backend/.mypy_cache || true
	rm -rf .ruff_cache backend/.ruff_cache || true
	rm -rf .cache || true
	rm -rf .coverage coverage.xml htmlcov backend/.coverage backend/htmlcov || true
	# Python build artifacts
	rm -rf build dist *.egg-info backend/*.egg-info || true
	# Frontend/other caches
	rm -rf "v0 (version 0)/.next" "v0 (version 0)/.vercel" || true
	# Local temp storage
	rm -rf /tmp/clientsynth || true


.PHONY: help dev dev-build build test test-backend test-frontend clean lint setup

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## First-time setup: copy env examples and install dependencies
	@echo "Setting up ECT development environment..."
	@cp -n backend/.env.example backend/.env || echo "backend/.env already exists"
	@cp -n frontend/.env.example frontend/.env.local || echo "frontend/.env.local already exists"
	@echo "Please edit backend/.env and frontend/.env.local with your values"

dev: ## Start development server with Docker Compose
	docker compose up

dev-build: ## Build and start development server
	docker compose up --build

dev-down: ## Stop development server
	docker compose down

build: ## Build production Docker images
	docker compose -f docker-compose.prod.yaml build

prod: ## Start production server
	docker compose -f docker-compose.prod.yaml up -d

prod-down: ## Stop production server
	docker compose -f docker-compose.prod.yaml down

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend Python tests
	cd backend && python -m pytest tests/ -v

test-frontend: ## Run frontend Jest tests
	cd frontend && npm test -- --watchAll=false

lint: ## Run linters
	cd backend && python -m flake8 app/ --max-line-length=120 || true
	cd frontend && npx tsc --noEmit

clean: ## Remove generated files and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned build artifacts"

install-backend: ## Install backend Python dependencies
	cd backend && pip install -r requirements.txt

install-frontend: ## Install frontend Node.js dependencies
	cd frontend && npm install

install: install-backend install-frontend ## Install all dependencies

logs: ## Show Docker logs
	docker compose logs -f

health: ## Check health of running services
	@curl -s http://localhost:8000/health | python3 -m json.tool

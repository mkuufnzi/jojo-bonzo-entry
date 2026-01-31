# =============================================================================
# Floovioo DOC TOOLS - DEPLOYMENT MAKEFILE
# =============================================================================
# Unified commands for development and deployment
# =============================================================================

.PHONY: preflight dev local-prod deploy clean help

# Default target
help:
	@echo ""
	@echo "Floovioo  - Deployment Commands"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Run preflight + start dev containers"
	@echo "  make dev-quick    - Start dev containers without preflight"
	@echo ""
	@echo "Local Production:"
	@echo "  make local-prod   - Run preflight + start local prod containers"
	@echo ""
	@echo "VPS Deployment:"
	@echo "  make deploy       - Run preflight + deploy to VPS"
	@echo ""
	@echo "Utilities:"
	@echo "  make preflight    - Run all preflight checks"
	@echo "  make build        - Build production image"
	@echo "  make clean        - Remove all containers and images"
	@echo "  make logs         - View container logs"
	@echo ""

# =============================================================================
# PREFLIGHT CHECK (MANDATORY BEFORE ANY DOCKER BUILD)
# =============================================================================
preflight:
	@echo "Running preflight checks..."
	@node scripts/preflight.js

# =============================================================================
# DEVELOPMENT
# =============================================================================
dev: preflight
	docker-compose -f docker-compose.dev.yml up --build

dev-quick:
	docker-compose -f docker-compose.dev.yml up

dev-down:
	docker-compose -f docker-compose.dev.yml down

# =============================================================================
# LOCAL PRODUCTION TEST
# =============================================================================
local-prod: preflight
	docker-compose -f docker-compose.local-prod.yml up --build

local-prod-down:
	docker-compose -f docker-compose.local-prod.yml down

# =============================================================================
# VPS PRODUCTION DEPLOYMENT
# =============================================================================
deploy: preflight
	docker-compose up -d --build

deploy-down:
	docker-compose down

# =============================================================================
# BUILD & PUSH (for CI/CD)
# =============================================================================
build: preflight
	docker build -t afs-doc-tools:latest .

push:
	docker tag afs-doc-tools:latest your-registry/afs-doc-tools:latest
	docker push your-registry/afs-doc-tools:latest

# =============================================================================
# UTILITIES
# =============================================================================
logs:
	docker-compose logs -f

clean:
	docker-compose -f docker-compose.dev.yml down -v --rmi local 2>/dev/null || true
	docker-compose -f docker-compose.local-prod.yml down -v --rmi local 2>/dev/null || true
	docker-compose down -v --rmi local 2>/dev/null || true
	docker system prune -f

# =============================================================================
# DATABASE
# =============================================================================
db-migrate:
	npx prisma migrate deploy

db-generate:
	npx prisma generate

db-studio:
	npx prisma studio

# Provision a new tenant
# Usage: make db-tenant TENANT=acme_corp PASSWORD=secret123
db-tenant:
	@./scripts/provision-tenant.sh $(TENANT) $(PASSWORD)

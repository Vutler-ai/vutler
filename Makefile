# Vutler Makefile
# Commands for development and testing

.PHONY: help install dev test test-e2e start stop clean logs

# Default target
help:
	@echo "Vutler - AI Agent Platform"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start development server"
	@echo "  make start        - Start production server"
	@echo "  make stop         - Stop server"
	@echo "  make test         - Run unit tests"
	@echo "  make test-e2e     - Run E2E integration tests"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make logs         - View server logs"
	@echo "  make clean        - Clean up"

# Install dependencies
install:
	cd app/custom && npm install

# Start development server
dev:
	cd app/custom && npm run dev

# Start production server
start:
	cd app/custom && npm start

# Stop server
stop:
	@pkill -f "node index.js" || true

# Run all unit tests
test:
	cd app/custom && npm test

# Run E2E integration tests (Sprint 4 enhanced suite)
test-e2e:
	@echo "Running Vutler E2E integration tests (Sprint 4)..."
	@cd app/custom && node tests/e2e-sprint4.test.js

# Run original E2E (happy-path only)
test-e2e-basic:
	@echo "Running basic E2E integration tests..."
	@cd app/custom && node tests/e2e.test.js

# Run tests in watch mode
test-watch:
	cd app/custom && npm run test:watch

# View logs
logs:
	@docker compose logs -f vutler-api

# Clean up
clean:
	@rm -rf app/custom/node_modules
	@rm -rf app/custom/data/drive/*
	@echo "Cleaned up"

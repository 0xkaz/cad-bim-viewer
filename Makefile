.PHONY: help install lint test build clean dev typecheck

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

dev: ## Start web + worker dev servers
	pnpm dev

typecheck: ## Run TypeScript type checks
	pnpm typecheck

lint: ## Run linters
	pnpm lint

lint-fix: ## Run linters and fix issues
	pnpm lint:fix

test: ## Run tests
	pnpm test

build: ## Build frontend and worker
	pnpm build

clean: ## Remove build artifacts
	rm -rf dist node_modules .wrangler

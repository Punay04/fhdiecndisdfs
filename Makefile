# Common tasks. Backend commands use backend/.venv; create it with `make install`.
.PHONY: install dev-api dev-ui test lint format data docker

PY := backend/.venv/bin

install:
	python3 -m venv backend/.venv
	$(PY)/pip install -r backend/requirements-dev.txt
	cd frontend && npm ci

dev-api:  ## API on :8000 with reload
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-ui:  ## Vite dev server on :5173, proxies /api to :8000
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run lint && npm run format:check

format:
	cd backend && .venv/bin/ruff format . && .venv/bin/ruff check --fix .
	cd frontend && npm run format

data:  ## Re-download the January 2026 snapshot from Elexon
	cd backend && .venv/bin/python -m scripts.fetch_data

docker:  ## Production-like container on http://localhost:8000
	docker compose up --build

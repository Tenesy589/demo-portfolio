.PHONY: up down logs ps clean

up:      ## Start the whole platform (21 containers)
	docker compose -f platform/compose.yaml up -d --build
	@echo "\n  Platform:  http://localhost:7100\n"

down:
	docker compose -f platform/compose.yaml down

ps:
	docker compose -f platform/compose.yaml ps

logs:
	docker compose -f platform/compose.yaml logs -f --tail=50

clean:   ## Stop and delete all volumes (fresh seed on next start)
	docker compose -f platform/compose.yaml down -v

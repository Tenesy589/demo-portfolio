.PHONY: proto tidy up down logs cli

# Regenerate gRPC code inside a container — no local Go/protoc install needed.
proto:
	docker run --rm -v $(PWD):/src -w /src golang:1.26 sh -c '\
	  apt-get update -qq && apt-get install -y -qq protobuf-compiler >/dev/null && \
	  go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
	  go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && \
	  protoc --go_out=. --go_opt=module=github.com/demo/pulsecheck \
	         --go-grpc_out=. --go-grpc_opt=module=github.com/demo/pulsecheck proto/pulse/v1/pulse.proto'

tidy:
	docker run --rm -v $(PWD):/src -w /src golang:1.26 go mod tidy

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f pulse-api pulse-prober

# Example: make cli ARGS="check https://go.dev https://github.com"
cli:
	docker compose run --rm pulsectl $(ARGS)

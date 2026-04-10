BINARY  := secblocks
MODULE  := secblocks
CMD_DIR := .

VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -ldflags "-X main.version=$(VERSION)"

.PHONY: all build clean test run install

all: build

build:
	go build $(LDFLAGS) -o $(BINARY) $(CMD_DIR)

build-release:
	go build $(LDFLAGS) -ldflags "-s -w" -o $(BINARY) $(CMD_DIR)

install:
	go install $(LDFLAGS) $(CMD_DIR)

test:
	go test ./...

clean:
	rm -f $(BINARY)

run:
	go run $(CMD_DIR) $(ARGS)

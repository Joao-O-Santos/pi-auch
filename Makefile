# SPDX-License-Identifier: MIT
# Copyright (c) 2026 João Oliveira Santos

.PHONY: all format typecheck style test smoke coverage pack verify clean

all: verify

format:
	npx biome check --write .

typecheck:
	npm run typecheck

style:
	npm run lint

test:
	npm test

smoke:
	npm run smoke

coverage:
	npm run coverage

pack:
	npm pack --dry-run

verify: typecheck style coverage pack
	git diff --check

.NOTPARALLEL: verify

clean:
	rm -f pi-auch-*.tgz

.PHONY: data clean dev build

data:
	bash scripts/preprocess.sh

dev:
	pnpm dev

build:
	pnpm build

clean:
	rm -rf data/raw public/data dist

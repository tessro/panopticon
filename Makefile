.PHONY: data disasm clean dev build

data:
	bash scripts/preprocess.sh

disasm:
	bash scripts/disassemble.sh

dev:
	pnpm dev

build:
	pnpm build

clean:
	rm -rf data/raw public/data dist

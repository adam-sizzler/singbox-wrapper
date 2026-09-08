# ==============================================================================
# singbox-wrapper Management Makefile
# ==============================================================================

# Colors
CYAN  := $(shell printf '\033[36m')
GREEN := $(shell printf '\033[32m')
YELLOW:= $(shell printf '\033[33m')
RESET := $(shell printf '\033[0m')

# Compiler variables
ifeq ($(origin CC),default)
CC := x86_64-w64-mingw32-gcc
endif
ifeq ($(origin CXX),default)
CXX := x86_64-w64-mingw32-g++
endif
CC ?= x86_64-w64-mingw32-gcc
CXX ?= x86_64-w64-mingw32-g++
SHIM_INCLUDE := $(CURDIR)/build/windows/msheaders

# Version tag detection from Git or env
RELEASE_TAG ?= $(APP_RELEASE_TAG)
ifeq ($(RELEASE_TAG),)
RELEASE_TAG := $(shell \
	tag=$$(git describe --tags --exact-match 2>/dev/null); \
	if [ -z "$$tag" ]; then tag=$$(git describe --tags --abbrev=0 2>/dev/null); fi; \
	if [ -z "$$tag" ]; then tag="dev"; fi; \
	echo $$tag | tr -d '\r\n' \
)
endif

LDFLAGS := -H=windowsgui -X singbox-gui-client/internal/app.appReleaseTag=$(RELEASE_TAG)

.PHONY: all help deps frontend rsrc build-windows clean changelog release

all: build-windows

help:
	@echo ""
	@echo "$(CYAN)singbox-wrapper Build & Release Automation$(RESET)"
	@echo ""
	@echo "  $(YELLOW)Building:$(RESET)"
	@echo "    $(GREEN)make build-windows$(RESET)                       - Build Windows binary (tag from git: $(RELEASE_TAG))"
	@echo "    $(GREEN)make build-windows RELEASE_TAG=v26.4.20$(RESET)   - Build Windows binary with specific version tag"
	@echo "    $(GREEN)make frontend$(RESET)                            - Build frontend bundle (Vite/React)"
	@echo "    $(GREEN)make rsrc$(RESET)                                - Generate Windows .syso resources (manifest/icon)"
	@echo "    $(GREEN)make clean$(RESET)                               - Clean build artifacts"
	@echo ""
	@echo "  $(YELLOW)Releases & GitHub Actions:$(RESET)"
	@echo "    $(GREEN)make changelog [TAG=vX.Y.Z]$(RESET)              - Preview changelog using changelogen"
	@echo "    $(GREEN)make release TAG=vX.Y.Z$(RESET)                  - Create & push release tag to trigger GitHub Actions"
	@echo ""

# Preload dependencies
deps:
	@echo "$(CYAN)Pre-downloading dependencies and tools...$(RESET)"
	go install github.com/akavel/rsrc@v0.10.2
	go mod download
	cd frontend && ( [ -d node_modules ] || npm ci || npm install )

# Build frontend
frontend:
	@echo "$(CYAN)Building frontend production bundle...$(RESET)"
	cd frontend && ( [ -d node_modules ] || npm ci || npm install ) && npm run build
	@echo "$(GREEN)Frontend bundle built successfully in internal/app/web/ui/$(RESET)"

# Generate Windows resources (.syso)
rsrc:
	@echo "$(CYAN)Generating Windows resources...$(RESET)"
	@if command -v rsrc >/dev/null 2>&1; then \
		rsrc -manifest build/windows/app.exe.manifest -ico build/windows/app-icon.ico -arch amd64 -o cmd/singbox-gui/rsrc.syso; \
	else \
		go run github.com/akavel/rsrc@v0.10.2 -manifest build/windows/app.exe.manifest -ico build/windows/app-icon.ico -arch amd64 -o cmd/singbox-gui/rsrc.syso; \
	fi

# Build for Windows
build-windows: frontend rsrc
	@echo "$(CYAN)Checking C/C++ compilers ($(CC), $(CXX))...$(RESET)"
	@command -v $(CC) >/dev/null 2>&1 || (echo "$(YELLOW)error: C compiler not found: $(CC)$(RESET)" && exit 1)
	@command -v $(CXX) >/dev/null 2>&1 || (echo "$(YELLOW)error: C++ compiler not found: $(CXX)$(RESET)" && exit 1)
	@echo "$(CYAN)Building singbox-wrapper.exe (tag: $(RELEASE_TAG))...$(RESET)"
	@rm -f singbox-wrapper.exe singbox-gui.exe
	CGO_CXXFLAGS="-I$(SHIM_INCLUDE) $(CGO_CXXFLAGS)" \
	CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC="$(CC)" CXX="$(CXX)" \
		go build -a -ldflags '$(LDFLAGS)' -o singbox-wrapper.exe ./cmd/singbox-gui
	@echo "$(GREEN)Built: $(CURDIR)/singbox-wrapper.exe$(RESET)"

# Generate preview changelog
changelog:
	@TARGET_TAG=$$(if [ -n "$(TAG)" ]; then echo "$(TAG)"; else if [ -n "$(v)" ]; then echo "$(v)"; else git describe --tags --abbrev=0 2>/dev/null; fi; fi) && \
	PREV_TAG=$$(git describe --tags --abbrev=0 "$${TARGET_TAG}^" 2>/dev/null || git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$$' | grep -v "^$$TARGET_TAG$$" | head -n 1 || true) && \
	echo "$(CYAN)Generating changelog from $${PREV_TAG:-beginning} to $$TARGET_TAG...$(RESET)" && \
	if [ -n "$$PREV_TAG" ]; then \
		npx -y changelogen@latest --no-contributors --from="$$PREV_TAG" --to="$$TARGET_TAG" 2>/dev/null | sed '/^\[log\]/d'; \
	else \
		npx -y changelogen@latest --no-contributors 2>/dev/null | sed '/^\[log\]/d'; \
	fi

# Release automation (exodus style)
release:
	@if [ -z "$(TAG)" ] && [ -z "$(v)" ]; then \
		echo "$(YELLOW)Error: Please specify TAG=vX.Y.Z (e.g. make release TAG=v26.9.2)$(RESET)"; \
		exit 1; \
	fi
	@TARGET_TAG=$$(if [ -n "$(TAG)" ]; then echo "$(TAG)"; else echo "$(v)"; fi) && \
	echo "$(CYAN)1/4 Checking for uncommitted changes...$(RESET)" && \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "$(YELLOW)Uncommitted changes detected. Staging & committing release preparations...$(RESET)" && \
		git add -A && git commit -m "chore(release): prepare $$TARGET_TAG"; \
	fi && \
	echo "$(CYAN)2/4 Pulling latest changes from origin main...$(RESET)" && \
	git pull --rebase origin main 2>/dev/null || true && \
	echo "$(CYAN)3/4 Tagging $$TARGET_TAG...$(RESET)" && \
	git tag -a "$$TARGET_TAG" -m "Release $$TARGET_TAG" && \
	echo "$(CYAN)4/4 Pushing main and $$TARGET_TAG to origin...$(RESET)" && \
	git push origin main && \
	git push origin "$$TARGET_TAG" && \
	echo "$(GREEN)Successfully released $$TARGET_TAG on main! GitHub Actions Release workflow started.$(RESET)"

clean:
	rm -f singbox-wrapper.exe singbox-gui.exe cmd/singbox-gui/rsrc.syso
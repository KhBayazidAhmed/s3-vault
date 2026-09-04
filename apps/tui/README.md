<div align="center">

# ⚡ S3 Vault CLI

**A high-performance, local-first, provider-neutral CLI & interactive Terminal UI (TUI) for S3-compatible object storage.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-fbf0df.svg?logo=bun&logoColor=black)](https://bun.sh/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-ef4444.svg?logo=turborepo&logoColor=white)](https://turbo.build/)
[![OpenTUI](https://img.shields.io/badge/Terminal_UI-OpenTUI-10b981.svg)](https://github.com/opentui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Features](#-key-features) • [Installation](#-installation--quick-start) • [TUI Interface](#-interactive-terminal-ui) • [CLI Commands](#-cli-command-reference) • [Supported Providers](#-supported-providers) • [Architecture](#-architecture)

</div>

---

## 📖 Overview

**S3 Vault CLI** bridges the gap between fast command-line file automation and rich interactive file management. Designed from the ground up to be **provider-neutral** and **local-first**, it provides unified access to **AWS S3, Cloudflare R2, MinIO, Wasabi**, and custom S3 endpoints with zero vendor lock-in.

Whether you need a scriptable command in your CI/CD pipeline, an interactive dual-pane terminal dashboard to browse and sync buckets, or resilient chunked multipart uploads for multi-gigabyte datasets, S3 Vault delivers a developer-centric workflow.

---

## ✨ Key Features

- 🖥️ **Interactive Dual-Pane TUI (OpenTUI)**: Explore local directories and remote buckets side-by-side with keyboard-driven navigation, real-time incremental search filtering, and live transfer progress bars.
- ⚡ **High-Performance Resumable Transfers**: Streaming multipart uploads and downloads managed by a concurrent worker pool, with automatic session resumption and checksum verification.
- 🔄 **Bidirectional Directory Sync**: Reconcile local directories and remote prefixes with customizable conflict policies (`newer`, `local-wins`, `remote-wins`, `fail`) and dry-run preview mode.
- 🛡️ **Zero-Leak Credential Security**: Secure credential storage using native OS Keychains (macOS Keychain, Linux Secret Service, Windows Credential Manager) with an AES-256-GCM encrypted keystore fallback. Automatic secret redaction prevents accidental credential leaks in logs or JSON envelopes.
- 📸 **Point-in-Time Snapshot Manifests**: Capture object state snapshots, diff changes across time, and export manifests in JSON or CSV.
- 🔗 **Instant Presigned Sharing**: Generate time-limited pre-signed download and upload URLs with automatic clipboard integration.
- 🔍 **Strict Integrity Verification**: Built-in MD5, SHA-256, and multipart ETag checksum verification ensure zero corrupted transfers.
- 🌐 **Provider Presets**: Instant configuration templates for AWS S3, Cloudflare R2, MinIO, Wasabi, and custom S3 implementations.

---

## 🚀 Installation & Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (v1.3 or higher recommended)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/KhBayazidAhmed/s3-vault.git
cd s3-vault
bun install
```

### 2. Link the CLI Globally
```bash
# Link the vault executable to your Bun global bin
bun run link:global

# Or run directly via Bun
bun run vault --help
```

### 3. Initialize Your First Storage Profile
```bash
# Example: Cloudflare R2
vault init --name prod-r2 \
  --provider cloudflare-r2 \
  --bucket my-backup-vault \
  --endpoint https://<account-id>.r2.cloudflarestorage.com \
  --key <ACCESS_KEY_ID> \
  --secret <SECRET_ACCESS_KEY> \
  --default

# Example: Local MinIO Sandbox
vault init --name local-minio \
  --provider minio \
  --bucket test-bucket \
  --endpoint http://localhost:9000 \
  --key minioadmin \
  --secret minioadmin
```

### 4. Verify Connectivity & Launch TUI
```bash
# Test connection, permissions, and latency
vault status

# Launch the interactive terminal dashboard
vault tui
```

---

## 🖥️ Interactive Terminal UI

Launch the dual-pane terminal manager anytime with:
```bash
vault tui
```

```
┌── ⚡ S3 VAULT v0.1.0 ──────────────────────────────────────────────────────────────────┐
│ 🔐 Profile: prod-r2 (cloudflare-r2)  •  Status: 🟢 Connected (42ms)  •  Bucket: my-vault│
└────────────────────────────────────────────────────────────────────────────────────────┘
┌── 📁 LOCAL FILES: /Users/username/data ─────┐┌── ☁️ REMOTE OBJECTS: /backup/ ──────────────┐
│  Name                  Size       Modified  ││  Key                   Size       Modified  │
│ 📁 ..                                       ││ 📁 ..                                       │
│ 📄 database.dump      1.24 GB    10:14 AM   ││ 📄 database.dump      1.24 GB    Yesterday  │
│ 📄 server.log        42.10 MB    09:30 AM   ││ 📄 server.log        38.40 MB    Sep 02     │
│ 📁 archives/                     12 items   ││ 📁 archives/                      8 items   │
└─────────────────────────────────────────────┘└─────────────────────────────────────────────┘
┌── ⌨️ STATUS & KEYBOARD SHORTCUTS ──────────────────────────────────────────────────────┐
│ ℹ Ready                                                                                │
│ [Tab] Switch   [↑/↓, j/k] Move   [Enter, l] Open   [Bksp, h] Up Dir   [U] Upload       │
│ [/, type] Search   [S] Share Link   [Del, x] Delete   [P] Profiles   [Q] Quit          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts Reference

| Key | Action | Description |
|---|---|---|
| `Tab` | **Switch Pane** | Toggle focus between Local and Remote browser panes |
| `↑` / `↓` or `j` / `k` | **Navigate** | Move cursor up / down through files and directories |
| `Enter` or `l` | **Open / Enter** | Open selected directory or preview object |
| `Backspace` or `h` | **Go Up** | Navigate to parent directory (`..`) |
| `U` | **Upload (Push)** | Upload selected local file/folder to current remote prefix |
| `D` | **Download (Pull)** | Download selected remote object to current local path |
| `/` or typing | **Live Search** | Filter items in active pane with instant fuzzy search |
| `S` | **Share Link** | Generate presigned shareable URL and copy to clipboard |
| `Delete` or `x` | **Delete** | Delete selected local file or remote object (with confirmation) |
| `P` | **Profile Switcher** | Open interactive profile selector modal |
| `R` | **Refresh** | Reload current directories and bucket listings |
| `Home` / `End` | **Jump** | Jump directly to start or end of list |
| `Q` / `Esc` | **Quit** | Exit interactive TUI / close open modal |

---

## 💻 CLI Command Reference

All CLI commands support structured output via `--json`, ideal for CI/CD scripting.

### Profile & Connectivity

#### `vault init`
Configure a new storage profile with provider presets, bucket, region, and credentials.
```bash
vault init -n prod-r2 --provider cloudflare-r2 -b my-bucket -e https://<id>.r2.cloudflarestorage.com --default
```

#### `vault profile`
Manage profiles: list, switch, view, or remove.
```bash
vault profile list              # List all configured profiles
vault profile use prod-r2       # Switch the active profile
vault profile show prod-r2      # Display profile settings
vault profile remove old-s3     # Remove a profile
```

#### `vault status`
Diagnose connection latency, bucket accessibility, and credential status.
```bash
vault status
vault status --json
```

---

### Transfers & Sync

#### `vault push`
Upload local files or entire directory trees with chunk streaming and checksum verification.
```bash
vault push ./dataset remote/dataset/ -r
vault push ./archive.tar.gz backup/ --share --expires 7200
vault push ./logs remote/logs/ --include "*.log" --dry-run
```

#### `vault pull`
Download remote objects or prefixes to your local machine.
```bash
vault pull remote/dataset/ ./dataset/ -r
vault pull backup/archive.tar.gz ./archive.tar.gz
```

#### `vault sync`
Synchronize local directories and remote prefixes with conflict resolution policies.
```bash
vault sync ./documents remote/documents/ --direction two-way --conflict newer
vault sync ./dist s3-static-site/ --direction up --delete --dry-run
```
* **Directions:** `up`, `down`, `two-way`
* **Conflict Policies:** `newer`, `local-wins`, `remote-wins`, `fail`, `ask`

---

### Object Operations

#### `vault ls`
List objects and virtual directories with prefix filtering.
```bash
vault ls
vault ls photos/2026/ -r --max-keys 500
```

#### `vault rm`
Remove remote objects or recursively delete prefixes.
```bash
vault rm remote/path/file.zip
vault rm remote/temp-folder/ -r
```

#### `vault info`
Inspect object metadata, ETag, content type, storage class, and checksums.
```bash
vault info documents/report.pdf
vault info documents/report.pdf --json
```

#### `vault search`
Find objects across prefixes by name, pattern, or size limits.
```bash
vault search "invoice" --prefix "financials/" --min-size 1048576
```

#### `vault share`
Generate time-limited presigned URLs for sharing.
```bash
vault share documents/report.pdf --expires 3600
vault share uploads/new-file.bin --method PUT --expires 1800
```

#### `vault verify`
Validate end-to-end file integrity between local and remote copies.
```bash
vault verify ./large-file.bin remote/large-file.bin
```

---

### History, Snapshots & Manifests

#### `vault history`
Query transfer logs, transfer rates, errors, and part completions.
```bash
vault history --limit 20
```

#### `vault snapshots`
Create and compare point-in-time snapshot manifests of your bucket.
```bash
vault snapshots create assets/      # Create point-in-time manifest
vault snapshots list                # List all snapshots
vault snapshots inspect <snapshotId>
vault snapshots compare <idA> <idB> # Diff changes between two snapshots
```

#### `vault dump`
Export snapshot manifests to JSON or CSV for auditing.
```bash
vault dump <snapshotId> --format json > manifest.json
vault dump <snapshotId> --format csv > manifest.csv
```

---

## 🌐 Supported Providers

| Provider | Preset Identifier | Default Region | Notes |
|---|---|---|---|
| **AWS S3** | `aws-s3` | `us-east-1` | Full standard S3 API, KMS, and multipart support |
| **Cloudflare R2** | `cloudflare-r2` | `auto` | Requires Account ID endpoint; zero egress fees |
| **MinIO** | `minio` | `us-east-1` | Path-style addressing enabled by default |
| **Wasabi** | `wasabi` | `us-east-1` | High-performance hot cloud storage |
| **Custom S3** | `custom-s3` | User-defined | Works with Ceph, DigitalOcean Spaces, Backblaze B2 |
| **Mock / Sandbox** | `mock` | `local` | Built-in zero-network mock backend for testing |

---

## 🔒 Security & Redaction Architecture

S3 Vault CLI adheres to strict security defaults:
1. **Multi-Tier Credential Resolution**:
   - Explicit CLI Flags (`--key`, `--secret`)
   - Environment Variables (`AWS_ACCESS_KEY_ID`, `S3_VAULT_KEY_ID_<PROFILE>`)
   - OS Native Credential Store (`macOS Keychain`, `Linux Secret Service`)
   - Encrypted Keystore Fallback (`~/.vault/credentials.enc`, encrypted using `AES-256-GCM` with file permissions `0600`)
2. **Redaction Engine**:
   - Access keys, tokens, auth signatures, presigned parameters, and registered secrets are automatically intercepted and sanitized (`[REDACTED]`) before terminal rendering or JSON serialization.

---

## 🏗️ Architecture

The codebase is organized as a Turborepo monorepo with clean separation of concerns:

```
s3-vault/
├── apps/
│   ├── tui/            # OpenTUI interactive file manager & Commander CLI runner
│   └── web/            # Astro & TailwindCSS documentation web portal
│
└── packages/
    ├── application/    # Orchestration layer and use cases (Push, Pull, Sync, etc.)
    ├── config/         # Multi-profile configuration manager & precedence resolution
    ├── domain/         # Core business entities, custom error types, checksum utilities
    ├── env/            # Type-safe environment validation
    ├── output/         # Formatter, tables, progress indicators, JSON envelopes
    ├── secrets/        # Multi-tier secret resolver, OS Keychain, AES encryption, redactor
    ├── state/          # SQLite database (state.db) tracking jobs, parts, locks, snapshots
    ├── storage/        # StorageBackend contract and neutral abstractions
    ├── storage-s3/     # AWS SDK v3 adapter with provider presets & error mapping
    ├── test-backend/   # In-memory and disk-based deterministic mock backends
    └── transfer/       # Batch transfer planner, multipart chunking engine, worker pool
```

---

## 🛠️ Development & Testing

```bash
# Run all unit and integration test suites (63 tests across 21 suites)
bun test

# Run code formatter and linter (Biome)
bun run check

# Type check all packages
bun run check-types

# Run web documentation portal locally (http://localhost:4321)
bun run dev:web
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

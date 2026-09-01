# S3 Vault CLI: Product Specification & Architecture

A provider-neutral command-line file vault for reliable, scriptable transfers across AWS S3, Cloudflare R2, MinIO, and other S3-compatible storage.

## 1\. Product brief
### Problem
Moving files to object storage is easy to start and painful to operate. Users need predictable transfers, resumability, verification, safe configuration, useful diagnostics, and a consistent experience across S3-compatible providers.
### Goal
Build a local-first CLI that makes object storage feel like a dependable file vault: simple for humans, composable in scripts, and safe for unattended jobs.
### Non-goals
*   Building a cloud-specific control plane or web dashboard.
*   Replacing mature S3 providers with a new storage service.
*   Storing plaintext credentials in project files.
*   Hiding provider-specific limitations when they affect behavior.
## 2\. Users and primary workflows
### Target users
*   Developers and operators managing backups, archives, and deployment artifacts.
*   Teams moving large files between local machines and S3-compatible storage.
*   CI jobs that need deterministic, non-interactive transfers.
### Core workflows
1. Initialize a storage profile with `vault init`.
2. Upload files or directories with `vault push`.
3. Download objects with `vault pull`.
4. Reconcile local and remote state with `vault sync`.
5. Inspect objects with `vault ls`, `vault info`, and `vault search`.
6. Verify integrity with `vault verify`.
7. Generate a temporary access link with `vault share`.
8. Review transfer activity with `vault history` and `vault snapshots`.
9. Diagnose configuration and connectivity with `vault status`.
## 3\. CLI specification

| Command | Purpose | Must support |
| ---| ---| --- |
| `vault init` | Create or select a storage profile | endpoint, region, bucket, prefix, addressing mode |
| `vault profile` | Manage profiles | list, show, use, rename, remove |
| `vault push <source> <target>` | Upload files/directories | recursion, include/exclude, resume, checksum, dry-run |
| `vault pull <source> <target>` | Download objects | recursion, resume, overwrite policy, checksum |
| `vault sync <local> <remote>` | Reconcile both sides | direction, delete policy, dry-run, conflict policy |
| `vault dump <source>` | Export a manifest or snapshot | JSON/CSV output, metadata, checksums |
| `vault ls [path]` | List objects | prefixes, recursive mode, JSON output |
| `vault search <query>` | Find objects | name, prefix, metadata, size, date filters |
| `vault info <path>` | Show object metadata | size, checksum, ETag, content type, timestamps |
| `vault share <path>` | Create a temporary URL | expiry, method, JSON output |
| `vault verify <path>` | Validate local/remote integrity | checksum algorithm, repair hint |
| `vault status` | Diagnose the active profile | auth, endpoint, bucket, permissions, latency |
| `vault history` | Show local transfer history | filters, pagination, JSON output |
| `vault snapshots` | Manage point-in-time manifests | create, list, inspect, compare |

Every command should offer human-readable output by default, `--json` for automation, `--quiet` for scripts, `--dry-run` where writes are possible, and consistent exit codes.
## 4\. Architecture

```plain
┌──────────────────────────────────────────────────────────┐
│                       CLI / TUI                           │
│ parsing · help · prompts · output · exit codes            │
└─────────────────────────────┬────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────┐
│                  Application Services                     │
│ push · pull · sync · verify · share · profiles · status   │
└───────────────┬──────────────────────────┬───────────────┘
                ▼                          ▼
┌──────────────────────────┐   ┌───────────────────────────┐
│ Transfer Engine           │   │ Local State                │
│ planning · queueing       │   │ profiles · manifests       │
│ retries · resume          │   │ history · snapshots        │
│ concurrency · progress    │   │ cache · locks              │
└───────────────┬──────────┘   └───────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────┐
│                 Storage Port / Interface                  │
│ objects · listing · metadata · multipart · delete · URLs  │
└─────────────────────────────┬────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────┐
│ Adapters: S3 · R2 · MinIO · Mock · Local filesystem       │
└──────────────────────────────────────────────────────────┘
```

### Module boundaries

```plain
apps/
  cli/                 command registration and process entrypoint
packages/
  domain/              object models, policies, errors, checksums
  application/         use cases and orchestration
  transfer/            planning, workers, retries, resumable jobs
  storage/             provider-neutral port and adapter contracts
  storage-s3/          AWS SDK S3-compatible adapter
  state/               local database, manifests, history, locks
  config/              profiles and environment resolution
  secrets/             OS keychain and environment secret providers
  output/              tables, JSON, progress, redaction
  test-backend/        deterministic in-memory/local backend
```

The CLI must never import an S3 SDK directly. It calls application services, which depend on interfaces. Provider adapters translate those interfaces into SDK calls.
## 5\. Storage abstraction

```plain
interface StorageBackend {
  headObject(input: HeadObjectInput): Promise<ObjectMetadata | null>
  getObject(input: GetObjectInput): Promise<ReadableStream>
  putObject(input: PutObjectInput): Promise<PutObjectResult>
  listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata>
  deleteObject(input: DeleteObjectInput): Promise<void>
  createMultipartUpload(input: MultipartInput): Promise<MultipartSession>
  uploadPart(input: UploadPartInput): Promise<UploadedPart>
  completeMultipartUpload(input: CompleteMultipartInput): Promise<void>
  abortMultipartUpload(input: AbortMultipartInput): Promise<void>
  createPresignedUrl(input: PresignInput): Promise<string>
}
```

The interface owns capability-neutral behavior. Adapters may expose optional capabilities through a capability registry, but command behavior must remain correct when an optional capability is unavailable.
## 6\. Transfer behavior
*   Build a plan before changing anything: additions, updates, deletions, conflicts, and skips.
*   Stream files instead of loading entire objects into memory.
*   Use multipart uploads above a configurable threshold.
*   Persist transfer state so interrupted jobs can resume safely.
*   Retry transient failures with exponential backoff and bounded attempts.
*   Limit concurrency with separate upload and download pools.
*   Verify checksums after transfer when the provider supports a reliable checksum.
*   Never delete during `sync` unless the user explicitly enables a delete policy.
*   Redact credentials, signed URLs, and secret values from logs and diagnostics.
## 7\. Configuration and security
Profiles contain endpoint, region, bucket, prefix, addressing mode, transfer settings, and checksum policy. Credentials are resolved in this order: explicit environment variables, OS keychain, then an approved external provider; never from plaintext project configuration.

Configuration precedence:

```plain
CLI flags > environment variables > active profile > global defaults
```

Use least-privilege credentials, TLS by default, clear warnings for insecure endpoints, atomic state writes, filesystem permissions restricted to the current user, and lock files to prevent concurrent state corruption.
## 8\. Local state
Store state under a platform-appropriate application directory:
*   `config`: profile metadata without secrets.
*   `state.db`: transfer history, resumable jobs, object cache, and locks.
*   `snapshots/`: immutable manifests with schema version and checksum.
*   `logs/`: redacted structured logs.

State migrations must be versioned and backwards-compatible for at least one prior schema version.
## 9\. Errors, output, and observability
Define stable error categories: configuration, authentication, authorization, network, not-found, conflict, integrity, storage-limit, cancellation, and internal. Human output should say what failed, why, and the next action. JSON output must use stable fields such as `code`, `message`, `path`, `provider`, `retryable`, and `details`.

Exit codes:

| Code | Meaning |
| ---| --- |
| 0 | Success |
| 1 | General failure |
| 2 | Invalid usage or configuration |
| 3 | Authentication or authorization failure |
| 4 | Integrity or verification failure |
| 5 | Partial success |
| 130 | Cancelled by user |

## 10\. Testing strategy
*   Unit tests for planning, conflict policies, checksums, retries, config precedence, and error mapping.
*   Contract tests that every storage adapter must pass.
*   End-to-end tests against the mock backend and local filesystem backend.
*   Provider compatibility tests against at least one real S3-compatible service.
*   Failure injection for timeouts, dropped connections, expired credentials, partial multipart uploads, and interrupted processes.
*   Golden tests for human output and JSON schemas.

The mock backend must support object CRUD, listing, metadata, multipart behavior, presigned URL generation, injected failures, and deterministic clocks.
## 11\. Acceptance criteria
*   All listed commands are registered with consistent help, flags, output, and exit codes.
*   No command layer imports a provider SDK.
*   AWS S3, Cloudflare R2, MinIO, and the mock backend use the same application services.
*   Interrupted transfers resume without corrupting or duplicating objects.
*   `--dry-run` produces a complete plan without mutating local or remote state.
*   Credentials and signed URLs never appear in logs, snapshots, or error messages.
*   The mock backend exercises push, pull, sync, verify, and share end to end.
*   Adding a new S3-compatible provider requires only a new adapter and adapter tests.
## 12\. Delivery plan
1. Define domain models, errors, storage interfaces, and configuration schema.
2. Implement mock backend and contract test suite.
3. Implement local state, profiles, secret resolution, and migrations.
4. Implement S3-compatible adapter with multipart and presigned URLs.
5. Build transfer engine with planning, retries, resume, progress, and verification.
6. Add CLI commands in workflow order: `init`, `status`, `ls`, `push`, `pull`, `sync`, `verify`, `share`, then history and snapshots.
7. Harden security, failure handling, compatibility tests, documentation, and release packaging.
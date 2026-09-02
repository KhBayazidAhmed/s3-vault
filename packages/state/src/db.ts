import { VaultPaths } from "@S3-vault-CLI/config";
import { Database } from "bun:sqlite";

export class DatabaseManager {
	private db: Database;

	constructor(customDbPath?: string) {
		VaultPaths.ensureVaultDirs();
		const dbPath = customDbPath ?? VaultPaths.getStateDbPath();
		this.db = new Database(dbPath);
		this.init();
	}

	get rawDb(): Database {
		return this.db;
	}

	private init(): void {
		// Configure SQLite for high concurrency and robustness
		this.db.run("PRAGMA journal_mode = WAL;");
		this.db.run("PRAGMA synchronous = NORMAL;");
		this.db.run("PRAGMA busy_timeout = 5000;");
		this.db.run("PRAGMA foreign_keys = ON;");

		this.runMigrations();
	}

	private runMigrations(): void {
		this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

		const currentVersionRow = this.db
			.query("SELECT MAX(version) as version FROM schema_migrations")
			.get() as { version: number | null };
		const currentVersion = currentVersionRow?.version ?? 0;

		if (currentVersion < 1) {
			this.db.transaction(() => {
				// Transfers & Jobs
				this.db.run(`
          CREATE TABLE IF NOT EXISTS transfers (
            id TEXT PRIMARY KEY,
            profile_name TEXT NOT NULL,
            direction TEXT NOT NULL,
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            total_items INTEGER NOT NULL DEFAULT 0,
            total_bytes INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT
          );
        `);

				this.db.run(`
          CREATE TABLE IF NOT EXISTS transfer_tasks (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            bytes_transferred INTEGER NOT NULL DEFAULT 0,
            local_hash TEXT,
            remote_hash TEXT,
            error TEXT,
            FOREIGN KEY (job_id) REFERENCES transfers(id) ON DELETE CASCADE
          );
        `);

				// Multipart upload tracking for interrupted transfers
				this.db.run(`
          CREATE TABLE IF NOT EXISTS multipart_uploads (
            upload_id TEXT PRIMARY KEY,
            profile_name TEXT NOT NULL,
            bucket TEXT NOT NULL,
            key TEXT NOT NULL,
            file_path TEXT NOT NULL,
            part_size INTEGER NOT NULL,
            total_parts INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

				this.db.run(`
          CREATE TABLE IF NOT EXISTS multipart_parts (
            upload_id TEXT NOT NULL,
            part_number INTEGER NOT NULL,
            etag TEXT NOT NULL,
            checksum_sha256 TEXT,
            size INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL,
            PRIMARY KEY (upload_id, part_number),
            FOREIGN KEY (upload_id) REFERENCES multipart_uploads(upload_id) ON DELETE CASCADE
          );
        `);

				// Object Cache
				this.db.run(`
          CREATE TABLE IF NOT EXISTS object_cache (
            profile_name TEXT NOT NULL,
            bucket TEXT NOT NULL,
            key TEXT NOT NULL,
            size INTEGER NOT NULL,
            last_modified TEXT NOT NULL,
            etag TEXT NOT NULL,
            checksum_sha256 TEXT,
            cached_at TEXT NOT NULL,
            PRIMARY KEY (profile_name, bucket, key)
          );
        `);

				// Concurrency Locks
				this.db.run(`
          CREATE TABLE IF NOT EXISTS locks (
            lock_id TEXT PRIMARY KEY,
            resource TEXT UNIQUE NOT NULL,
            acquired_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            owner_pid INTEGER NOT NULL
          );
        `);

				// Record migration
				this.db.run(
					"INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)",
					[new Date().toISOString()],
				);
			})();
		}

		if (currentVersion < 2) {
			this.db.transaction(() => {
				this.db.run(`
				CREATE TABLE IF NOT EXISTS uploaded_files (
					id TEXT PRIMARY KEY,
					profile_name TEXT NOT NULL,
					bucket TEXT NOT NULL,
					remote_key TEXT NOT NULL,
					local_path TEXT NOT NULL,
					local_name TEXT NOT NULL,
					file_size INTEGER NOT NULL,
					local_mtime_ms REAL NOT NULL,
					local_sha256 TEXT NOT NULL,
					device_id INTEGER,
					inode INTEGER,
					remote_etag TEXT,
					remote_checksum_sha256 TEXT,
					uploaded_at TEXT NOT NULL,
					remote_verified_at TEXT,
					UNIQUE (profile_name, bucket, remote_key)
				);
			`);

				this.db.run(`
				CREATE INDEX IF NOT EXISTS idx_uploaded_files_local_path
				ON uploaded_files (profile_name, bucket, local_path);
			`);
				this.db.run(`
				CREATE INDEX IF NOT EXISTS idx_uploaded_files_identity
				ON uploaded_files (profile_name, bucket, device_id, inode);
			`);
				this.db.run(`
				CREATE INDEX IF NOT EXISTS idx_uploaded_files_hash_size
				ON uploaded_files (profile_name, bucket, local_sha256, file_size);
			`);

				this.db.run(
					"INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)",
					[new Date().toISOString()],
				);
			})();
		}

		if (currentVersion < 3) {
			this.db.transaction(() => {
				this.db.run(
					"ALTER TABLE multipart_uploads ADD COLUMN source_mtime_ms REAL",
				);
				this.db.run(
					"ALTER TABLE multipart_uploads ADD COLUMN source_sha256 TEXT",
				);
				this.db.run(
					"INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)",
					[new Date().toISOString()],
				);
			})();
		}
	}

	close(): void {
		this.db.close();
	}
}

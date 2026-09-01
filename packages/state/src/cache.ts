import type { ObjectMetadata } from "@S3-vault-CLI/domain";
import type { Database } from "bun:sqlite";

export class ObjectCacheManager {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	cacheObject(profileName: string, bucket: string, obj: ObjectMetadata): void {
		const now = new Date().toISOString();
		this.db.run(
			`INSERT OR REPLACE INTO object_cache (
        profile_name, bucket, key, size, last_modified, etag, checksum_sha256, cached_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				profileName,
				bucket,
				obj.key,
				obj.size,
				obj.lastModified.toISOString(),
				obj.etag,
				obj.checksumSha256 ?? null,
				now,
			],
		);
	}

	getCachedObject(
		profileName: string,
		bucket: string,
		key: string,
	): ObjectMetadata | null {
		const row = this.db
			.query(
				"SELECT * FROM object_cache WHERE profile_name = ? AND bucket = ? AND key = ?",
			)
			.get(profileName, bucket, key) as Record<string, any> | null;

		if (!row) return null;

		return {
			key: row.key,
			size: row.size,
			lastModified: new Date(row.last_modified),
			etag: row.etag,
			checksumSha256: row.checksum_sha256 || undefined,
		};
	}

	evictObject(profileName: string, bucket: string, key: string): void {
		this.db.run(
			"DELETE FROM object_cache WHERE profile_name = ? AND bucket = ? AND key = ?",
			[profileName, bucket, key],
		);
	}

	evictPrefix(profileName: string, bucket: string, prefix: string): void {
		this.db.run(
			"DELETE FROM object_cache WHERE profile_name = ? AND bucket = ? AND key LIKE ?",
			[profileName, bucket, `${prefix}%`],
		);
	}

	clearCache(profileName?: string, bucket?: string): void {
		if (profileName && bucket) {
			this.db.run(
				"DELETE FROM object_cache WHERE profile_name = ? AND bucket = ?",
				[profileName, bucket],
			);
		} else if (profileName) {
			this.db.run("DELETE FROM object_cache WHERE profile_name = ?", [
				profileName,
			]);
		} else {
			this.db.run("DELETE FROM object_cache");
		}
	}
}

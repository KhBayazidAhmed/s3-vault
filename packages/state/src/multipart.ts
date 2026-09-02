import type { Database } from "bun:sqlite";

export interface StoredMultipartSession {
	uploadId: string;
	profileName: string;
	bucket: string;
	key: string;
	filePath: string;
	partSize: number;
	totalParts: number;
	totalBytes: number;
	sourceMtimeMs?: number;
	sourceSha256?: string;
	status: "in_progress" | "completed" | "aborted";
	createdAt: string;
	updatedAt: string;
	parts: {
		partNumber: number;
		etag: string;
		checksumSha256?: string;
		size: number;
	}[];
}

export class MultipartRepository {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	saveSession(session: {
		uploadId: string;
		profileName: string;
		bucket: string;
		key: string;
		filePath: string;
		partSize: number;
		totalParts: number;
		totalBytes: number;
		sourceMtimeMs: number;
		sourceSha256?: string;
	}): void {
		const now = new Date().toISOString();
		this.db.run(
			`INSERT OR REPLACE INTO multipart_uploads (
	        upload_id, profile_name, bucket, key, file_path,
	        part_size, total_parts, total_bytes, source_mtime_ms, source_sha256,
	        status, created_at, updated_at
	      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)`,
			[
				session.uploadId,
				session.profileName,
				session.bucket,
				session.key,
				session.filePath,
				session.partSize,
				session.totalParts,
				session.totalBytes,
				session.sourceMtimeMs,
				session.sourceSha256 ?? null,
				now,
				now,
			],
		);
	}

	recordPart(part: {
		uploadId: string;
		partNumber: number;
		etag: string;
		checksumSha256?: string;
		size: number;
	}): void {
		const now = new Date().toISOString();
		this.db.transaction(() => {
			this.db.run(
				`INSERT OR REPLACE INTO multipart_parts (
          upload_id, part_number, etag, checksum_sha256, size, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
				[
					part.uploadId,
					part.partNumber,
					part.etag,
					part.checksumSha256 ?? null,
					part.size,
					now,
				],
			);

			this.db.run(
				"UPDATE multipart_uploads SET updated_at = ? WHERE upload_id = ?",
				[now, part.uploadId],
			);
		})();
	}

	findActiveSession(
		profileName: string,
		bucket: string,
		key: string,
		filePath: string,
	): StoredMultipartSession | null {
		const row = this.db
			.query(
				`SELECT * FROM multipart_uploads
       WHERE profile_name = ? AND bucket = ? AND key = ? AND file_path = ? AND status = 'in_progress'
       ORDER BY created_at DESC LIMIT 1`,
			)
			.get(profileName, bucket, key, filePath) as Record<string, any> | null;

		if (!row) return null;

		const parts = this.db
			.query(
				"SELECT * FROM multipart_parts WHERE upload_id = ? ORDER BY part_number ASC",
			)
			.all(row.upload_id) as Record<string, any>[];

		return {
			uploadId: row.upload_id,
			profileName: row.profile_name,
			bucket: row.bucket,
			key: row.key,
			filePath: row.file_path,
			partSize: row.part_size,
			totalParts: row.total_parts,
			totalBytes: row.total_bytes,
			sourceMtimeMs: row.source_mtime_ms ?? undefined,
			sourceSha256: row.source_sha256 ?? undefined,
			status: row.status,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			parts: parts.map((p) => ({
				partNumber: p.part_number,
				etag: p.etag,
				checksumSha256: p.checksum_sha256 || undefined,
				size: p.size,
			})),
		};
	}

	markCompleted(uploadId: string): void {
		this.db.run(
			"UPDATE multipart_uploads SET status = 'completed', updated_at = ? WHERE upload_id = ?",
			[new Date().toISOString(), uploadId],
		);
	}

	markAborted(uploadId: string): void {
		this.db.run(
			"UPDATE multipart_uploads SET status = 'aborted', updated_at = ? WHERE upload_id = ?",
			[new Date().toISOString(), uploadId],
		);
	}
}

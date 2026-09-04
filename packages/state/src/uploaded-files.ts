import type { UploadedFileRecord } from "@S3-vault-CLI/domain";
import type { Database, Statement } from "bun:sqlite";

type UploadedFileRow = {
	id: string;
	profile_name: string;
	bucket: string;
	remote_key: string;
	local_path: string;
	local_name: string;
	file_size: number;
	local_mtime_ms: number;
	local_sha256: string;
	device_id: number | null;
	inode: number | null;
	remote_etag: string | null;
	remote_checksum_sha256: string | null;
	uploaded_at: string;
	remote_verified_at: string | null;
};

function toUploadedFileRecord(row: UploadedFileRow): UploadedFileRecord {
	return {
		id: row.id,
		profileName: row.profile_name,
		bucket: row.bucket,
		remoteKey: row.remote_key,
		localPath: row.local_path,
		localName: row.local_name,
		fileSize: row.file_size,
		localMtimeMs: row.local_mtime_ms,
		localSha256: row.local_sha256,
		deviceId: row.device_id ?? undefined,
		inode: row.inode ?? undefined,
		remoteEtag: row.remote_etag ?? undefined,
		remoteChecksumSha256: row.remote_checksum_sha256 ?? undefined,
		uploadedAt: new Date(row.uploaded_at),
		remoteVerifiedAt: row.remote_verified_at
			? new Date(row.remote_verified_at)
			: undefined,
	};
}

export class UploadedFileRepository {
	private db: Database;
	private upsertStmt: Statement;
	private findByPathStmt: Statement;
	private findByIdentityStmt: Statement;
	private findByHashStmt: Statement;
	private removeByRemoteKeyStmt: Statement;

	constructor(db: Database) {
		this.db = db;
		this.upsertStmt = this.db.prepare(
			`INSERT INTO uploaded_files (
				id, profile_name, bucket, remote_key, local_path, local_name,
				file_size, local_mtime_ms, local_sha256, device_id, inode,
				remote_etag, remote_checksum_sha256, uploaded_at, remote_verified_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(profile_name, bucket, remote_key) DO UPDATE SET
				local_path = excluded.local_path,
				local_name = excluded.local_name,
				file_size = excluded.file_size,
				local_mtime_ms = excluded.local_mtime_ms,
				local_sha256 = excluded.local_sha256,
				device_id = excluded.device_id,
				inode = excluded.inode,
				remote_etag = excluded.remote_etag,
				remote_checksum_sha256 = excluded.remote_checksum_sha256,
				uploaded_at = excluded.uploaded_at,
				remote_verified_at = excluded.remote_verified_at`,
		);

		this.findByPathStmt = this.db.prepare(
			`SELECT * FROM uploaded_files
			 WHERE profile_name = ? AND bucket = ? AND local_path = ?
			 ORDER BY uploaded_at DESC LIMIT 1`,
		);

		this.findByIdentityStmt = this.db.prepare(
			`SELECT * FROM uploaded_files
			 WHERE profile_name = ? AND bucket = ? AND device_id = ? AND inode = ?
			 ORDER BY uploaded_at DESC LIMIT 1`,
		);

		this.findByHashStmt = this.db.prepare(
			`SELECT * FROM uploaded_files
			 WHERE profile_name = ? AND bucket = ?
			 AND local_sha256 = ? AND file_size = ?
			 ORDER BY uploaded_at DESC LIMIT 1`,
		);

		this.removeByRemoteKeyStmt = this.db.prepare(
			`DELETE FROM uploaded_files
			 WHERE profile_name = ? AND bucket = ? AND remote_key = ?`,
		);
	}

	upsertSuccessfulUpload(record: UploadedFileRecord): void {
		this.upsertStmt.run(
			record.id,
			record.profileName,
			record.bucket,
			record.remoteKey,
			record.localPath,
			record.localName,
			record.fileSize,
			record.localMtimeMs,
			record.localSha256,
			record.deviceId ?? null,
			record.inode ?? null,
			record.remoteEtag ?? null,
			record.remoteChecksumSha256 ?? null,
			record.uploadedAt.toISOString(),
			record.remoteVerifiedAt?.toISOString() ?? null,
		);
	}

	getForLocalPaths(
		profileName: string,
		bucket: string,
		paths: string[],
	): UploadedFileRecord[] {
		if (paths.length === 0) return [];

		const placeholders = paths.map(() => "?").join(", ");
		const rows = this.db
			.query(
				`SELECT * FROM uploaded_files
				 WHERE profile_name = ? AND bucket = ?
				 AND local_path IN (${placeholders})
				 ORDER BY local_path ASC, uploaded_at ASC`,
			)
			.all(profileName, bucket, ...paths) as UploadedFileRow[];

		return rows.map(toUploadedFileRecord);
	}

	findByLocalPath(
		profileName: string,
		bucket: string,
		localPath: string,
	): UploadedFileRecord | null {
		const row = this.findByPathStmt.get(
			profileName,
			bucket,
			localPath,
		) as UploadedFileRow | null;

		return row ? toUploadedFileRecord(row) : null;
	}

	findByFileIdentity(
		profileName: string,
		bucket: string,
		deviceId: number,
		inode: number,
	): UploadedFileRecord | null {
		const row = this.findByIdentityStmt.get(
			profileName,
			bucket,
			deviceId,
			inode,
		) as UploadedFileRow | null;

		return row ? toUploadedFileRecord(row) : null;
	}

	findByHash(
		profileName: string,
		bucket: string,
		hash: string,
		size: number,
	): UploadedFileRecord | null {
		const row = this.findByHashStmt.get(
			profileName,
			bucket,
			hash,
			size,
		) as UploadedFileRow | null;

		return row ? toUploadedFileRecord(row) : null;
	}

	removeByRemoteKey(
		profileName: string,
		bucket: string,
		remoteKey: string,
	): void {
		this.removeByRemoteKeyStmt.run(profileName, bucket, remoteKey);
	}
}

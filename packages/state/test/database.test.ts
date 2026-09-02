import type { UploadedFileRecord } from "@S3-vault-CLI/domain";
import { describe, expect, it } from "bun:test";
import { UploadedFileRepository } from "../src/uploaded-files.js";
import { useStateTestContext } from "./test-helpers.js";

describe("State: Database, Transfers, Multipart, Locks, Snapshots & Uploaded Files", () => {
	const fixture = useStateTestContext();

	it("runs state migrations with uploaded-file indexes and multipart fingerprints", () => {
		const migration = fixture.dbManager.rawDb
			.query("SELECT version FROM schema_migrations WHERE version = 2")
			.get() as { version: number } | null;
		const multipartMigration = fixture.dbManager.rawDb
			.query("SELECT version FROM schema_migrations WHERE version = 3")
			.get() as { version: number } | null;
		const multipartColumns = fixture.dbManager.rawDb
			.query("PRAGMA table_info('multipart_uploads')")
			.all() as { name: string }[];
		const indexes = fixture.dbManager.rawDb
			.query("PRAGMA index_list('uploaded_files')")
			.all() as { name: string }[];
		const indexNames = indexes.map((index) => index.name);

		expect(migration?.version).toBe(2);
		expect(multipartMigration?.version).toBe(3);
		expect(multipartColumns.map((column) => column.name)).toContain(
			"source_mtime_ms",
		);
		expect(multipartColumns.map((column) => column.name)).toContain(
			"source_sha256",
		);
		expect(indexNames).toContain("idx_uploaded_files_local_path");
		expect(indexNames).toContain("idx_uploaded_files_identity");
		expect(indexNames).toContain("idx_uploaded_files_hash_size");
	});

	it("upserts and queries successful uploads", () => {
		const repo = new UploadedFileRepository(fixture.dbManager.rawDb);
		const uploadedAt = new Date("2026-08-30T12:00:00.000Z");
		const remoteVerifiedAt = new Date("2026-08-30T12:01:00.000Z");
		const record: UploadedFileRecord = {
			id: "uploaded_01",
			profileName: "prod",
			bucket: "vault-bucket",
			remoteKey: "documents/report.txt",
			localPath: "/vault/report.txt",
			localName: "report.txt",
			fileSize: 1024,
			localMtimeMs: 1_787_999_999_123.5,
			localSha256: "sha256-report",
			deviceId: 42,
			inode: 9001,
			remoteEtag: '"etag-report"',
			remoteChecksumSha256: "remote-sha256-report",
			uploadedAt,
			remoteVerifiedAt,
		};

		repo.upsertSuccessfulUpload(record);

		expect(
			repo.findByLocalPath("prod", "vault-bucket", record.localPath),
		).toEqual(record);
		expect(repo.findByFileIdentity("prod", "vault-bucket", 42, 9001)?.id).toBe(
			"uploaded_01",
		);
		expect(
			repo.findByHash("prod", "vault-bucket", "sha256-report", 1024)?.remoteKey,
		).toBe("documents/report.txt");
		expect(
			repo.getForLocalPaths("prod", "vault-bucket", [record.localPath]),
		).toEqual([record]);
		expect(
			repo.getForLocalPaths("other", "vault-bucket", [record.localPath]),
		).toEqual([]);
		expect(repo.getForLocalPaths("prod", "vault-bucket", [])).toEqual([]);

		repo.upsertSuccessfulUpload({
			...record,
			localPath: "/vault/renamed-report.txt",
			localName: "renamed-report.txt",
			localMtimeMs: record.localMtimeMs + 1,
		});

		expect(
			repo.findByLocalPath("prod", "vault-bucket", record.localPath),
		).toBeNull();
		const updated = repo.findByLocalPath(
			"prod",
			"vault-bucket",
			"/vault/renamed-report.txt",
		);
		expect(updated?.id).toBe("uploaded_01");
		expect(updated?.localName).toBe("renamed-report.txt");

		repo.removeByRemoteKey("prod", "vault-bucket", record.remoteKey);
		expect(
			repo.findByLocalPath("prod", "vault-bucket", "/vault/renamed-report.txt"),
		).toBeNull();
	});
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseManager } from "../src/db.js";
import { LockManager } from "../src/locks.js";
import { MultipartRepository } from "../src/multipart.js";
import { SnapshotRepository } from "../src/snapshots.js";
import { TransferRepository } from "../src/transfers.js";

describe("State: Database, Transfers, Multipart, Locks & Snapshots", () => {
	let tempDir: string;
	let dbManager: DatabaseManager;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "vault-state-test-"));
		const dbPath = join(tempDir, "state.db");
		dbManager = new DatabaseManager(dbPath);
	});

	afterEach(() => {
		dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("persists transfer jobs and queries history", () => {
		const repo = new TransferRepository(dbManager.rawDb);
		const now = new Date();

		repo.createJob(
			{
				id: "job_01",
				profileName: "test-profile",
				direction: "push",
				sourcePath: "./local",
				targetPath: "remote/",
				totalItems: 2,
				totalBytes: 2048,
				status: "in_progress",
				createdAt: now,
				updatedAt: now,
			},
			[
				{
					id: "task_01",
					sourcePath: "./local/a.txt",
					targetPath: "remote/a.txt",
					relativePath: "a.txt",
					size: 1024,
					action: "upload",
					status: "pending",
					bytesTransferred: 0,
				},
			],
		);

		const fetched = repo.getJob("job_01");
		expect(fetched).not.toBeNull();
		expect(fetched?.job.profileName).toBe("test-profile");
		expect(fetched?.tasks.length).toBe(1);
		expect(fetched?.tasks[0]?.relativePath).toBe("a.txt");

		repo.updateJobStatus("job_01", "completed");
		const history = repo.listHistory({ profileName: "test-profile" });
		expect(history.length).toBe(1);
		expect(history[0]?.status).toBe("completed");
	});

	it("tracks multipart upload parts and recovers session", () => {
		const multipartRepo = new MultipartRepository(dbManager.rawDb);

		multipartRepo.saveSession({
			uploadId: "mp_upload_123",
			profileName: "prod",
			bucket: "vault-bucket",
			key: "bigfile.iso",
			filePath: "/local/bigfile.iso",
			partSize: 8 * 1024 * 1024,
			totalParts: 4,
			totalBytes: 32 * 1024 * 1024,
		});

		multipartRepo.recordPart({
			uploadId: "mp_upload_123",
			partNumber: 1,
			etag: '"etag1"',
			size: 8 * 1024 * 1024,
		});

		multipartRepo.recordPart({
			uploadId: "mp_upload_123",
			partNumber: 2,
			etag: '"etag2"',
			size: 8 * 1024 * 1024,
		});

		const activeSession = multipartRepo.findActiveSession(
			"prod",
			"vault-bucket",
			"bigfile.iso",
			"/local/bigfile.iso",
		);

		expect(activeSession).not.toBeNull();
		expect(activeSession?.uploadId).toBe("mp_upload_123");
		expect(activeSession?.parts.length).toBe(2);
		expect(activeSession?.parts.map((p) => p.partNumber)).toEqual([1, 2]);
	});

	it("manages concurrency locks", () => {
		const lockManager = new LockManager(dbManager.rawDb);
		const lock1 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock1.acquired).toBe(true);

		const lock2 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock2.acquired).toBe(false);
		expect(lock2.error).toContain("currently locked");

		if (lock1.lockId) {
			lockManager.releaseLock(lock1.lockId);
		}

		const lock3 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock3.acquired).toBe(true);
	});

	it("creates, diffs, and exports snapshots", () => {
		const snapshotsDir = join(tempDir, "snapshots");
		const snapshotRepo = new SnapshotRepository(snapshotsDir);

		const snapA = snapshotRepo.createSnapshot("prod", "my-bucket", [
			{
				path: "file1.txt",
				size: 100,
				lastModified: "2026-08-28T00:00:00Z",
				etag: '"etag1"',
			},
			{
				path: "file2.txt",
				size: 200,
				lastModified: "2026-08-28T00:00:00Z",
				etag: '"etag2"',
			},
		]);

		const snapB = snapshotRepo.createSnapshot("prod", "my-bucket", [
			{
				path: "file1.txt",
				size: 150,
				lastModified: "2026-08-28T01:00:00Z",
				etag: '"etag1_updated"',
			},
			{
				path: "file3.txt",
				size: 300,
				lastModified: "2026-08-28T01:00:00Z",
				etag: '"etag3"',
			},
		]);

		const diff = snapshotRepo.compareSnapshots("prod", snapA.id, snapB.id);
		expect(diff.added.length).toBe(1);
		expect(diff.added[0]?.path).toBe("file3.txt");
		expect(diff.removed.length).toBe(1);
		expect(diff.removed[0]?.path).toBe("file2.txt");
		expect(diff.modified.length).toBe(1);
		expect(diff.modified[0]?.path).toBe("file1.txt");
		expect(diff.modified[0]?.sizeDelta).toBe(50);

		const csvExport = snapshotRepo.exportManifest(snapA, "csv");
		expect(csvExport).toContain('"file1.txt",100');
		expect(csvExport).toContain('"file2.txt",200');
	});
});

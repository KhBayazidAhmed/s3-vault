import { describe, expect, it } from "bun:test";
import { MultipartRepository } from "../src/multipart.js";
import { TransferRepository } from "../src/transfers.js";
import { useStateTestContext } from "./test-helpers.js";

describe("State: Database, Transfers, Multipart, Locks, Snapshots & Uploaded Files", () => {
	const fixture = useStateTestContext();

	it("persists transfer jobs and queries history", () => {
		const repo = new TransferRepository(fixture.dbManager.rawDb);
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

	it("reconciles stale in_progress jobs to cancelled on history query", () => {
		const repo = new TransferRepository(fixture.dbManager.rawDb);
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

		repo.createJob(
			{
				id: "job_stale",
				profileName: "test-profile",
				direction: "pull",
				sourcePath: "remote/bixbd.dmg",
				targetPath: "./bixbd.dmg",
				totalItems: 1,
				totalBytes: 1024 * 1024 * 1024,
				status: "in_progress",
				createdAt: tenMinutesAgo,
				updatedAt: tenMinutesAgo,
			},
			[],
		);

		const history = repo.listHistory({ profileName: "test-profile" });
		const staleJob = history.find((j) => j.id === "job_stale");
		expect(staleJob).toBeDefined();
		expect(staleJob?.status).toBe("cancelled");
		expect(staleJob?.errorMessage).toBe("Interrupted");
	});

	it("tracks multipart upload parts and recovers session", () => {
		const multipartRepo = new MultipartRepository(fixture.dbManager.rawDb);

		multipartRepo.saveSession({
			uploadId: "mp_upload_123",
			profileName: "prod",
			bucket: "vault-bucket",
			key: "bigfile.iso",
			filePath: "/local/bigfile.iso",
			partSize: 8 * 1024 * 1024,
			totalParts: 4,
			totalBytes: 32 * 1024 * 1024,
			sourceMtimeMs: 1_788_000_000_000,
			sourceSha256: "large-file-sha256",
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
		expect(activeSession?.sourceMtimeMs).toBe(1_788_000_000_000);
		expect(activeSession?.sourceSha256).toBe("large-file-sha256");
		expect(activeSession?.parts.map((p) => p.partNumber)).toEqual([1, 2]);
	});
});

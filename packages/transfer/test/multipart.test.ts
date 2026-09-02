import { DatabaseManager, MultipartRepository } from "@S3-vault-CLI/state";
import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TransferEngine } from "../src/engine.js";
import { TransferPlanner } from "../src/planner.js";
import { useTransferTestContext } from "./test-helpers.js";

describe("Transfer: Planner & Engine", () => {
	const fixture = useTransferTestContext();

	it("executes multipart upload when file exceeds threshold", async () => {
		// Create a 600KB file with 200KB multipart threshold and 100KB part size for testing
		const totalSize = 600 * 1024;
		const testData = Buffer.alloc(totalSize, "x");
		const largeFilePath = join(fixture.tempDir, "large.bin");
		writeFileSync(largeFilePath, testData);

		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: fixture.tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "large-dest",
		});

		const engine = new TransferEngine(fixture.backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			multipartThresholdBytes: 200 * 1024,
			partSizeBytes: 100 * 1024,
			verifyChecksum: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);

		const head = await fixture.backend.headObject({
			bucket: "test-bucket",
			key: "large-dest/large.bin",
		});

		expect(head).not.toBeNull();
		expect(head?.size).toBe(totalSize);
		expect(head?.etag.endsWith('-6"')).toBe(true); // 6 parts
	});

	it("uploads multipart parts concurrently within the configured limit", async () => {
		const totalSize = 600 * 1024;
		writeFileSync(
			join(fixture.tempDir, "parallel.bin"),
			Buffer.alloc(totalSize, "p"),
		);
		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: fixture.tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "parallel-dest",
		});

		const originalUploadPart = fixture.backend.uploadPart.bind(fixture.backend);
		let activeParts = 0;
		let maxActiveParts = 0;
		fixture.backend.uploadPart = async (input) => {
			activeParts++;
			maxActiveParts = Math.max(maxActiveParts, activeParts);
			try {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return await originalUploadPart(input);
			} finally {
				activeParts--;
			}
		};

		const engine = new TransferEngine(fixture.backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			concurrency: 3,
			multipartThresholdBytes: 200 * 1024,
			partSizeBytes: 100 * 1024,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);
		expect(maxActiveParts).toBe(3);
	});

	it("does not resume multipart parts when the source content changed", async () => {
		const dbManager = new DatabaseManager(
			join(fixture.tempDir, "resume-state.db"),
		);
		try {
			const multipartRepo = new MultipartRepository(dbManager.rawDb);
			const filePath = join(fixture.tempDir, "resume.bin");
			writeFileSync(filePath, Buffer.alloc(400 * 1024, "a"));

			let createdSessions = 0;
			const originalCreateMultipart =
				fixture.backend.createMultipartUpload.bind(fixture.backend);
			fixture.backend.createMultipartUpload = async (input) => {
				createdSessions++;
				return await originalCreateMultipart(input);
			};
			fixture.backend.injectFailure({
				operation: "uploadPart",
				partNumber: 2,
				timesRemaining: 1,
				error: new Error("connection dropped"),
			});

			const firstPlan = await TransferPlanner.plan(fixture.backend, {
				direction: "push",
				localPath: filePath,
				remoteBucket: "test-bucket",
				remotePrefix: "resume.bin",
				computeHash: true,
			});
			const firstEngine = new TransferEngine(
				fixture.backend,
				{
					profileName: "test-prof",
					bucket: "test-bucket",
					concurrency: 1,
					multipartThresholdBytes: 200 * 1024,
					partSizeBytes: 100 * 1024,
					maxRetries: 0,
				},
				{ multipartRepo },
			);
			expect((await firstEngine.execute(firstPlan)).success).toBe(false);

			writeFileSync(filePath, Buffer.alloc(400 * 1024, "b"));
			fixture.backend.clearFailures();
			const secondPlan = await TransferPlanner.plan(fixture.backend, {
				direction: "push",
				localPath: filePath,
				remoteBucket: "test-bucket",
				remotePrefix: "resume.bin",
				computeHash: true,
			});
			const secondEngine = new TransferEngine(
				fixture.backend,
				{
					profileName: "test-prof",
					bucket: "test-bucket",
					concurrency: 2,
					multipartThresholdBytes: 200 * 1024,
					partSizeBytes: 100 * 1024,
					maxRetries: 0,
				},
				{ multipartRepo },
			);

			expect((await secondEngine.execute(secondPlan)).success).toBe(true);
			expect(createdSessions).toBe(2);
		} finally {
			dbManager.close();
		}
	});
});

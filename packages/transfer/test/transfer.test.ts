import { InMemoryStorageBackend } from "@S3-vault-CLI/test-backend";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TransferEngine } from "../src/engine.js";
import { TransferPlanner } from "../src/planner.js";

describe("Transfer: Planner & Engine", () => {
	let tempDir: string;
	let backend: InMemoryStorageBackend;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "vault-transfer-test-"));
		backend = new InMemoryStorageBackend();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("plans push additions, updates, and skips correctly", async () => {
		// 1. Create local files
		writeFileSync(join(tempDir, "file1.txt"), "Hello 1");
		writeFileSync(join(tempDir, "file2.txt"), "Hello 2");

		// 2. Put file2 in backend with older mtime
		await backend.putObject({
			bucket: "test-bucket",
			key: "remote-dir/file2.txt",
			body: "Old content",
		});

		const plan = await TransferPlanner.plan(backend, {
			direction: "push",
			localPath: tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "remote-dir",
		});

		expect(plan.direction).toBe("push");
		expect(plan.totalCount).toBe(2);
		expect(plan.additions).toBe(1); // file1
		expect(plan.updates).toBe(1); // file2
	});

	it("executes transfer plan and uploads files", async () => {
		writeFileSync(join(tempDir, "upload.txt"), "Data to upload");

		const plan = await TransferPlanner.plan(backend, {
			direction: "push",
			localPath: tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "dest",
		});

		const engine = new TransferEngine(backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			verifyChecksum: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);
		expect(result.errors.length).toBe(0);

		const head = await backend.headObject({
			bucket: "test-bucket",
			key: "dest/upload.txt",
		});
		expect(head).not.toBeNull();
		expect(head?.size).toBe(Buffer.byteLength("Data to upload"));
	});

	it("executes multipart upload when file exceeds threshold", async () => {
		// Create a 600KB file with 200KB multipart threshold and 100KB part size for testing
		const totalSize = 600 * 1024;
		const testData = Buffer.alloc(totalSize, "x");
		const largeFilePath = join(tempDir, "large.bin");
		writeFileSync(largeFilePath, testData);

		const plan = await TransferPlanner.plan(backend, {
			direction: "push",
			localPath: tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "large-dest",
		});

		const engine = new TransferEngine(backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			multipartThresholdBytes: 200 * 1024,
			partSizeBytes: 100 * 1024,
			verifyChecksum: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);

		const head = await backend.headObject({
			bucket: "test-bucket",
			key: "large-dest/large.bin",
		});

		expect(head).not.toBeNull();
		expect(head?.size).toBe(totalSize);
		expect(head?.etag.endsWith('-6"')).toBe(true); // 6 parts
	});

	it("supports dry-run without writing to remote backend", async () => {
		writeFileSync(join(tempDir, "dry.txt"), "Dry run content");

		const plan = await TransferPlanner.plan(backend, {
			direction: "push",
			localPath: tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "dry-dest",
		});

		const engine = new TransferEngine(backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			dryRun: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);

		const head = await backend.headObject({
			bucket: "test-bucket",
			key: "dry-dest/dry.txt",
		});
		expect(head).toBeNull(); // Untouched
	});
});

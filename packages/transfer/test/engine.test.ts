import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TransferEngine } from "../src/engine.js";
import { TransferPlanner } from "../src/planner.js";
import { useTransferTestContext } from "./test-helpers.js";

describe("Transfer: Planner & Engine", () => {
	const fixture = useTransferTestContext();

	it("executes transfer plan and uploads files", async () => {
		writeFileSync(join(fixture.tempDir, "upload.txt"), "Data to upload");

		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: fixture.tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "dest",
		});

		const engine = new TransferEngine(fixture.backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			verifyChecksum: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);
		expect(result.errors.length).toBe(0);

		const head = await fixture.backend.headObject({
			bucket: "test-bucket",
			key: "dest/upload.txt",
		});
		expect(head).not.toBeNull();
		expect(head?.size).toBe(Buffer.byteLength("Data to upload"));
	});

	it("supports dry-run without writing to remote backend", async () => {
		writeFileSync(join(fixture.tempDir, "dry.txt"), "Dry run content");

		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: fixture.tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "dry-dest",
		});

		const engine = new TransferEngine(fixture.backend, {
			profileName: "test-prof",
			bucket: "test-bucket",
			dryRun: true,
		});

		const result = await engine.execute(plan);
		expect(result.success).toBe(true);

		const head = await fixture.backend.headObject({
			bucket: "test-bucket",
			key: "dry-dest/dry.txt",
		});
		expect(head).toBeNull(); // Untouched
	});
});

import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TransferPlanner } from "../src/planner.js";
import { useTransferTestContext } from "./test-helpers.js";

describe("Transfer: Planner & Engine", () => {
	const fixture = useTransferTestContext();

	it("plans push additions, updates, and skips correctly", async () => {
		// 1. Create local files
		writeFileSync(join(fixture.tempDir, "file1.txt"), "Hello 1");
		writeFileSync(join(fixture.tempDir, "file2.txt"), "Hello 2");

		// 2. Put file2 in backend with older mtime
		await fixture.backend.putObject({
			bucket: "test-bucket",
			key: "remote-dir/file2.txt",
			body: "Old content",
		});

		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: fixture.tempDir,
			remoteBucket: "test-bucket",
			remotePrefix: "remote-dir",
		});

		expect(plan.direction).toBe("push");
		expect(plan.totalCount).toBe(2);
		expect(plan.additions).toBe(1); // file1
		expect(plan.updates).toBe(1); // file2
	});

	it("skips duplicate upload when matching file already exists on remote", async () => {
		const filePath = join(fixture.tempDir, "sample.mp4");
		writeFileSync(filePath, "video-binary-content-12345");

		// Put identical object in remote
		await fixture.backend.putObject({
			bucket: "test-bucket",
			key: "sample.mp4",
			body: "video-binary-content-12345",
		});

		// 1. Plan push without force
		const plan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: filePath,
			remoteBucket: "test-bucket",
			remotePrefix: "sample.mp4",
			computeHash: true,
		});

		expect(plan.totalCount).toBe(1);
		expect(plan.skips).toBe(1);
		expect(plan.additions).toBe(0);
		expect(plan.updates).toBe(0);
		expect(plan.items[0]?.action).toBe("skip");
		expect(plan.items[0]?.reason).toContain("Duplicate");

		// 2. Plan push with force: true
		const forcePlan = await TransferPlanner.plan(fixture.backend, {
			direction: "push",
			localPath: filePath,
			remoteBucket: "test-bucket",
			remotePrefix: "sample.mp4",
			computeHash: true,
			force: true,
		});

		expect(forcePlan.skips).toBe(0);
		expect(forcePlan.updates).toBe(1);
		expect(forcePlan.items[0]?.action).toBe("upload");
	});
});

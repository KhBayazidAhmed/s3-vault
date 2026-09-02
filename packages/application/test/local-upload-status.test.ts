import { describe, expect, it } from "bun:test";
import { renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeleteUseCase } from "../src/use-cases/delete.js";
import { LocalUploadStatusUseCase } from "../src/use-cases/local-upload-status.js";
import { PushUseCase } from "../src/use-cases/push.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("tracks uploaded, renamed, and changed local files", async () => {
		const originalPath = join(fixture.tempDir, "tracked.txt");
		writeFileSync(originalPath, "tracked content");

		const pushResult = await new PushUseCase(fixture.context).execute({
			source: originalPath,
			target: "tracked/tracked.txt",
		});
		expect(pushResult.success).toBe(true);

		const statusUseCase = new LocalUploadStatusUseCase(fixture.context);
		const originalStats = statSync(originalPath);
		const uploaded = statusUseCase.execute({
			profileName: "test-profile",
			bucket: "test-vault-bucket",
			files: [
				{
					path: originalPath,
					name: "tracked.txt",
					size: originalStats.size,
					modifiedAtMs: originalStats.mtimeMs,
					deviceId: originalStats.dev,
					inode: originalStats.ino,
				},
			],
		});
		expect(uploaded.get(originalPath)?.status).toBe("uploaded");

		const renamedPath = join(fixture.tempDir, "renamed.txt");
		renameSync(originalPath, renamedPath);
		const renamedStats = statSync(renamedPath);
		const renamed = statusUseCase.execute({
			profileName: "test-profile",
			bucket: "test-vault-bucket",
			files: [
				{
					path: renamedPath,
					name: "renamed.txt",
					size: renamedStats.size,
					modifiedAtMs: renamedStats.mtimeMs,
					deviceId: renamedStats.dev,
					inode: renamedStats.ino,
				},
			],
		});
		expect(renamed.get(renamedPath)?.status).toBe("renamed");

		writeFileSync(renamedPath, "changed local content");
		const changedStats = statSync(renamedPath);
		const changed = statusUseCase.execute({
			profileName: "test-profile",
			bucket: "test-vault-bucket",
			files: [
				{
					path: renamedPath,
					name: "renamed.txt",
					size: changedStats.size,
					modifiedAtMs: changedStats.mtimeMs,
					deviceId: changedStats.dev,
					inode: changedStats.ino,
				},
			],
		});
		expect(changed.get(renamedPath)?.status).toBe("changed");

		await new DeleteUseCase(fixture.context).execute({
			path: "tracked/tracked.txt",
		});
		const afterRemoteDelete = statusUseCase.execute({
			profileName: "test-profile",
			bucket: "test-vault-bucket",
			files: [
				{
					path: renamedPath,
					name: "renamed.txt",
					size: changedStats.size,
					modifiedAtMs: changedStats.mtimeMs,
					deviceId: changedStats.dev,
					inode: changedStats.ino,
				},
			],
		});
		expect(afterRemoteDelete.get(renamedPath)?.status).toBe("new");
	});

	it("detects objects deleted or changed outside the CLI", async () => {
		const localPath = join(fixture.tempDir, "externally-managed.txt");
		writeFileSync(localPath, "original remote content");
		await new PushUseCase(fixture.context).execute({
			source: localPath,
			target: "external/file.txt",
		});

		const stats = statSync(localPath);
		const input = {
			profileName: "test-profile",
			bucket: "test-vault-bucket",
			files: [
				{
					path: localPath,
					name: "externally-managed.txt",
					size: stats.size,
					modifiedAtMs: stats.mtimeMs,
					deviceId: stats.dev,
					inode: stats.ino,
				},
			],
		};
		const { storage } = fixture.context.resolveRuntime();
		const statusUseCase = new LocalUploadStatusUseCase(fixture.context);

		await storage.deleteObject({
			bucket: "test-vault-bucket",
			key: "external/file.txt",
		});
		const missing = await statusUseCase.executeWithRemoteVerification(
			input,
			storage,
		);
		expect(missing.get(localPath)?.status).toBe("remote-missing");

		await storage.putObject({
			bucket: "test-vault-bucket",
			key: "external/file.txt",
			body: Buffer.from("replacement content from elsewhere"),
		});
		const changed = await statusUseCase.executeWithRemoteVerification(
			input,
			storage,
		);
		expect(changed.get(localPath)?.status).toBe("remote-changed");
	});
});

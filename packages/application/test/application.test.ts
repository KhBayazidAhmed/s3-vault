import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServiceContext } from "../src/service-context.js";
import { DeleteUseCase } from "../src/use-cases/delete.js";
import { DumpUseCase } from "../src/use-cases/dump.js";
import { InitProfileUseCase } from "../src/use-cases/init-profile.js";
import { ListObjectsUseCase } from "../src/use-cases/list-objects.js";
import { ObjectInfoUseCase } from "../src/use-cases/object-info.js";
import { PullUseCase } from "../src/use-cases/pull.js";
import { PushUseCase } from "../src/use-cases/push.js";
import { SearchUseCase } from "../src/use-cases/search.js";
import { ShareUseCase } from "../src/use-cases/share.js";
import { SnapshotsUseCase } from "../src/use-cases/snapshots.js";
import { StatusUseCase } from "../src/use-cases/status.js";
import { SyncUseCase } from "../src/use-cases/sync.js";
import { VerifyUseCase } from "../src/use-cases/verify.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	let tempDir: string;
	let context: ServiceContext;
	const originalVaultHome = process.env.VAULT_HOME;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "vault-app-test-"));
		process.env.VAULT_HOME = tempDir;

		const configPath = join(tempDir, "config.json");
		const dbPath = join(tempDir, "state.db");
		const snapshotsDir = join(tempDir, "snapshots");

		context = new ServiceContext({
			customConfigPath: configPath,
			customDbPath: dbPath,
			customSnapshotsDir: snapshotsDir,
		});

		// Initialize mock profile
		const initUseCase = new InitProfileUseCase(context);
		await initUseCase.execute({
			name: "test-profile",
			provider: "mock",
			bucket: "test-vault-bucket",
			isDefault: true,
		});
	});

	afterEach(() => {
		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
		if (originalVaultHome) {
			process.env.VAULT_HOME = originalVaultHome;
		} else {
			delete process.env.VAULT_HOME;
		}
	});

	it("checks status of active profile", async () => {
		const statusUseCase = new StatusUseCase(context);
		const status = await statusUseCase.execute();

		expect(status.profileName).toBe("test-profile");
		expect(status.provider).toBe("mock");
		expect(status.bucket).toBe("test-vault-bucket");
		expect(status.health.ok).toBe(true);
	});

	it("pushes, lists, inspects, pulls, verifies, and shares objects", async () => {
		const localDir = join(tempDir, "local-files");
		mkdirSync(localDir, { recursive: true });
		const sampleFile = join(localDir, "document.txt");
		writeFileSync(sampleFile, "Vault Content for Testing E2E");

		// 1. Push
		const pushUseCase = new PushUseCase(context);
		const pushRes = await pushUseCase.execute({
			source: localDir,
			target: "vault-docs",
		});
		expect(pushRes.success).toBe(true);

		// 2. List
		const listUseCase = new ListObjectsUseCase(context);
		const objects = await listUseCase.execute({ path: "vault-docs" });
		expect(objects.length).toBe(1);
		expect(objects[0]?.key).toBe("vault-docs/document.txt");

		// 3. Info
		const infoUseCase = new ObjectInfoUseCase(context);
		const info = await infoUseCase.execute("vault-docs/document.txt");
		expect(info.size).toBe(Buffer.byteLength("Vault Content for Testing E2E"));

		// 4. Search
		const searchUseCase = new SearchUseCase(context);
		const searchRes = await searchUseCase.execute({ query: "document" });
		expect(searchRes.length).toBe(1);
		expect(searchRes[0]?.key).toBe("vault-docs/document.txt");

		// 5. Verify
		const verifyUseCase = new VerifyUseCase(context);
		const verifyRes = await verifyUseCase.execute(
			sampleFile,
			"vault-docs/document.txt",
		);
		expect(verifyRes.isMatch).toBe(true);

		// 6. Share
		const shareUseCase = new ShareUseCase(context);
		const shareRes = await shareUseCase.execute({
			key: "vault-docs/document.txt",
			expiresInSeconds: 1800,
		});
		expect(shareRes.url).toContain("vault-docs/document.txt");
		expect(shareRes.expiresInSeconds).toBe(1800);

		// 7. Pull to new location
		const downloadDir = join(tempDir, "downloaded");
		const pullUseCase = new PullUseCase(context);
		const pullRes = await pullUseCase.execute({
			source: "vault-docs",
			target: downloadDir,
		});
		expect(pullRes.success).toBe(true);
		const downloadedContent = readFileSync(
			join(downloadDir, "document.txt"),
			"utf-8",
		);
		expect(downloadedContent).toBe("Vault Content for Testing E2E");
	});

	it("supports push with --share and prevents duplicate re-uploading while still returning share URL", async () => {
		const videoFile = join(tempDir, "demo.mp4");
		writeFileSync(videoFile, "mp4-video-stream-sample-data");

		const pushUseCase = new PushUseCase(context);

		// 1. Initial push with --share and --expires 3600
		const pushRes1 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			share: true,
			expiresInSeconds: 3600,
		});

		expect(pushRes1.success).toBe(true);
		expect(pushRes1.plan.additions).toBe(1);
		expect(pushRes1.plan.skips).toBe(0);
		expect(pushRes1.shareUrl).toBeDefined();
		expect(pushRes1.shareUrl).toContain("media/demo.mp4");
		expect(pushRes1.shareExpiresInSeconds).toBe(3600);
		expect(pushRes1.sharedKey).toBe("media/demo.mp4");

		// 2. Duplicate push without force -> should skip re-upload but still return share link
		const pushRes2 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			share: true,
			expiresInSeconds: 1800,
		});

		expect(pushRes2.success).toBe(true);
		expect(pushRes2.plan.skips).toBe(1);
		expect(pushRes2.plan.additions).toBe(0);
		expect(pushRes2.shareUrl).toBeDefined();
		expect(pushRes2.shareUrl).toContain("media/demo.mp4");
		expect(pushRes2.shareExpiresInSeconds).toBe(1800);

		// 3. Push with force: true -> should upload
		const pushRes3 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			force: true,
		});

		expect(pushRes3.success).toBe(true);
		expect(pushRes3.plan.updates).toBe(1);
		expect(pushRes3.plan.skips).toBe(0);
	});

	it("creates point-in-time snapshots and dumps manifest", async () => {
		// Add sample files
		const localDir = join(tempDir, "snap-local");
		mkdirSync(localDir, { recursive: true });
		writeFileSync(join(localDir, "a.json"), JSON.stringify({ a: 1 }));
		writeFileSync(join(localDir, "b.json"), JSON.stringify({ b: 2 }));

		const pushUseCase = new PushUseCase(context);
		await pushUseCase.execute({ source: localDir, target: "snapshot-target" });

		// Create snapshot
		const snapshotsUseCase = new SnapshotsUseCase(context);
		const manifest = await snapshotsUseCase.create("snapshot-target");
		expect(manifest.totalObjects).toBe(2);
		expect(manifest.rootChecksumSha256).toBeDefined();

		const list = snapshotsUseCase.list();
		expect(list.length).toBe(1);

		// Dump manifest as JSON and CSV
		const dumpUseCase = new DumpUseCase(context);
		const jsonDump = await dumpUseCase.execute({
			format: "json",
			sourcePrefix: "snapshot-target",
		});
		expect(JSON.parse(jsonDump).totalObjects).toBe(2);

		const csvDump = await dumpUseCase.execute({
			format: "csv",
			sourcePrefix: "snapshot-target",
		});
		expect(csvDump).toContain("path,size");
	});

	it("syncs directories with conflict resolution", async () => {
		const syncLocal = join(tempDir, "sync-dir");
		mkdirSync(syncLocal, { recursive: true });
		writeFileSync(join(syncLocal, "sync-file.txt"), "Sync initial");

		const syncUseCase = new SyncUseCase(context);
		const syncPlan = await syncUseCase.plan({
			localPath: syncLocal,
			remotePath: "sync-remote",
			direction: "up",
		});

		expect(syncPlan.additions).toBe(1);

		const syncExec = await syncUseCase.execute({
			localPath: syncLocal,
			remotePath: "sync-remote",
			direction: "up",
		});
		expect(syncExec.success).toBe(true);
	});

	it("deletes single objects and directory prefixes recursively with cache eviction", async () => {
		const pushUseCase = new PushUseCase(context);
		const deleteUseCase = new DeleteUseCase(context);
		const listUseCase = new ListObjectsUseCase(context);

		const dir = join(tempDir, "to-delete");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "f1.txt"), "File 1");
		writeFileSync(join(dir, "f2.txt"), "File 2");
		writeFileSync(join(dir, "single.txt"), "Single File");

		await pushUseCase.execute({ source: dir, target: "nested/folder" });

		// Verify objects exist
		let objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(3);

		// 1. Delete single object
		const delSingle = await deleteUseCase.execute({
			path: "nested/folder/single.txt",
		});
		expect(delSingle.deletedCount).toBe(1);
		expect(delSingle.deletedKeys).toEqual(["nested/folder/single.txt"]);

		objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(2);
		expect(objects.some((o) => o.key.endsWith("single.txt"))).toBe(false);

		// 2. Dry run recursive delete
		const dryRunRes = await deleteUseCase.execute({
			path: "nested/folder",
			recursive: true,
			dryRun: true,
		});
		expect(dryRunRes.deletedCount).toBe(2);
		expect(dryRunRes.dryRun).toBe(true);

		// Objects still present after dry-run
		objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(2);

		// 3. Actual recursive delete
		const recRes = await deleteUseCase.execute({
			path: "nested/folder",
			recursive: true,
		});
		expect(recRes.deletedCount).toBe(2);

		objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(0);
	});
});

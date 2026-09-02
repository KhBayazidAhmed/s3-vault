import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { SnapshotRepository } from "../src/snapshots.js";
import { useStateTestContext } from "./test-helpers.js";

describe("State: Database, Transfers, Multipart, Locks, Snapshots & Uploaded Files", () => {
	const fixture = useStateTestContext();

	it("creates, diffs, and exports snapshots", () => {
		const snapshotsDir = join(fixture.tempDir, "snapshots");
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

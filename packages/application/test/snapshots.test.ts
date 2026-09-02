import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DumpUseCase } from "../src/use-cases/dump.js";
import { PushUseCase } from "../src/use-cases/push.js";
import { SnapshotsUseCase } from "../src/use-cases/snapshots.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("creates point-in-time snapshots and dumps manifest", async () => {
		// Add sample files
		const localDir = join(fixture.tempDir, "snap-local");
		mkdirSync(localDir, { recursive: true });
		writeFileSync(join(localDir, "a.json"), JSON.stringify({ a: 1 }));
		writeFileSync(join(localDir, "b.json"), JSON.stringify({ b: 2 }));

		const pushUseCase = new PushUseCase(fixture.context);
		await pushUseCase.execute({ source: localDir, target: "snapshot-target" });

		// Create snapshot
		const snapshotsUseCase = new SnapshotsUseCase(fixture.context);
		const manifest = await snapshotsUseCase.create("snapshot-target");
		expect(manifest.totalObjects).toBe(2);
		expect(manifest.rootChecksumSha256).toBeDefined();

		const list = snapshotsUseCase.list();
		expect(list.length).toBe(1);

		// Dump manifest as JSON and CSV
		const dumpUseCase = new DumpUseCase(fixture.context);
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
});

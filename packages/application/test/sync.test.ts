import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SyncUseCase } from "../src/use-cases/sync.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("syncs directories with conflict resolution", async () => {
		const syncLocal = join(fixture.tempDir, "sync-dir");
		mkdirSync(syncLocal, { recursive: true });
		writeFileSync(join(syncLocal, "sync-file.txt"), "Sync initial");

		const syncUseCase = new SyncUseCase(fixture.context);
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
});

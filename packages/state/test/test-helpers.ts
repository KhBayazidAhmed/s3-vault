import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseManager } from "../src/db.js";

export interface StateTestContext {
	tempDir: string;
	dbManager: DatabaseManager;
}

export function useStateTestContext(): StateTestContext {
	const fixture = {} as StateTestContext;

	beforeEach(() => {
		fixture.tempDir = mkdtempSync(join(tmpdir(), "vault-state-test-"));
		fixture.dbManager = new DatabaseManager(join(fixture.tempDir, "state.db"));
	});

	afterEach(() => {
		fixture.dbManager.close();
		rmSync(fixture.tempDir, { recursive: true, force: true });
	});

	return fixture;
}

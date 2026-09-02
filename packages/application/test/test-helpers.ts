import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServiceContext } from "../src/service-context.js";
import { InitProfileUseCase } from "../src/use-cases/init-profile.js";

export interface ApplicationTestContext {
	tempDir: string;
	context: ServiceContext;
}

export function useApplicationTestContext(): ApplicationTestContext {
	const fixture = {} as ApplicationTestContext;
	const originalVaultHome = process.env.VAULT_HOME;

	beforeEach(async () => {
		fixture.tempDir = mkdtempSync(join(tmpdir(), "vault-app-test-"));
		process.env.VAULT_HOME = fixture.tempDir;

		fixture.context = new ServiceContext({
			customConfigPath: join(fixture.tempDir, "config.json"),
			customDbPath: join(fixture.tempDir, "state.db"),
			customSnapshotsDir: join(fixture.tempDir, "snapshots"),
		});

		await new InitProfileUseCase(fixture.context).execute({
			name: "test-profile",
			provider: "mock",
			bucket: "test-vault-bucket",
			isDefault: true,
		});
	});

	afterEach(() => {
		fixture.context.dbManager.close();
		rmSync(fixture.tempDir, { recursive: true, force: true });
		if (originalVaultHome) {
			process.env.VAULT_HOME = originalVaultHome;
		} else {
			delete process.env.VAULT_HOME;
		}
	});

	return fixture;
}

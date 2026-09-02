import { InMemoryStorageBackend } from "@S3-vault-CLI/test-backend";
import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TransferTestContext {
	tempDir: string;
	backend: InMemoryStorageBackend;
}

export function useTransferTestContext(): TransferTestContext {
	const fixture = {} as TransferTestContext;

	beforeEach(() => {
		fixture.tempDir = mkdtempSync(join(tmpdir(), "vault-transfer-test-"));
		fixture.backend = new InMemoryStorageBackend();
	});

	afterEach(() => {
		rmSync(fixture.tempDir, { recursive: true, force: true });
	});

	return fixture;
}

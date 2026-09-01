import { runStorageContractTests } from "@S3-vault-CLI/storage";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	InMemoryStorageBackend,
	LocalFileSystemStorageBackend,
} from "../src/index.js";

// 1. Run storage contract tests against InMemoryStorageBackend
runStorageContractTests("InMemoryStorageBackend", async () => {
	return new InMemoryStorageBackend();
});

// 2. Run storage contract tests against LocalFileSystemStorageBackend
let tempFsDir: string;
runStorageContractTests("LocalFileSystemStorageBackend", async () => {
	tempFsDir = mkdtempSync(join(tmpdir(), "vault-fs-storage-"));
	return new LocalFileSystemStorageBackend(tempFsDir);
});

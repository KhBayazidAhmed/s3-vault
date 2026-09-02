import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ListObjectsUseCase } from "../src/use-cases/list-objects.js";
import { ObjectInfoUseCase } from "../src/use-cases/object-info.js";
import { PullUseCase } from "../src/use-cases/pull.js";
import { PushUseCase } from "../src/use-cases/push.js";
import { SearchUseCase } from "../src/use-cases/search.js";
import { ShareUseCase } from "../src/use-cases/share.js";
import { StatusUseCase } from "../src/use-cases/status.js";
import { VerifyUseCase } from "../src/use-cases/verify.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("checks status of active profile", async () => {
		const statusUseCase = new StatusUseCase(fixture.context);
		const status = await statusUseCase.execute();

		expect(status.profileName).toBe("test-profile");
		expect(status.provider).toBe("mock");
		expect(status.bucket).toBe("test-vault-bucket");
		expect(status.health.ok).toBe(true);
	});

	it("pushes, lists, inspects, pulls, verifies, and shares objects", async () => {
		const localDir = join(fixture.tempDir, "local-files");
		mkdirSync(localDir, { recursive: true });
		const sampleFile = join(localDir, "document.txt");
		writeFileSync(sampleFile, "Vault Content for Testing E2E");

		// 1. Push
		const pushUseCase = new PushUseCase(fixture.context);
		const pushRes = await pushUseCase.execute({
			source: localDir,
			target: "vault-docs",
		});
		expect(pushRes.success).toBe(true);

		// 2. List
		const listUseCase = new ListObjectsUseCase(fixture.context);
		const objects = await listUseCase.execute({ path: "vault-docs" });
		expect(objects.length).toBe(1);
		expect(objects[0]?.key).toBe("vault-docs/document.txt");

		// 3. Info
		const infoUseCase = new ObjectInfoUseCase(fixture.context);
		const info = await infoUseCase.execute("vault-docs/document.txt");
		expect(info.size).toBe(Buffer.byteLength("Vault Content for Testing E2E"));

		// 4. Search
		const searchUseCase = new SearchUseCase(fixture.context);
		const searchRes = await searchUseCase.execute({ query: "document" });
		expect(searchRes.length).toBe(1);
		expect(searchRes[0]?.key).toBe("vault-docs/document.txt");

		// 5. Verify
		const verifyUseCase = new VerifyUseCase(fixture.context);
		const verifyRes = await verifyUseCase.execute(
			sampleFile,
			"vault-docs/document.txt",
		);
		expect(verifyRes.isMatch).toBe(true);

		// 6. Share
		const shareUseCase = new ShareUseCase(fixture.context);
		const shareRes = await shareUseCase.execute({
			key: "vault-docs/document.txt",
			expiresInSeconds: 1800,
		});
		expect(shareRes.url).toContain("vault-docs/document.txt");
		expect(shareRes.expiresInSeconds).toBe(1800);

		// 7. Pull to new location
		const downloadDir = join(fixture.tempDir, "downloaded");
		const pullUseCase = new PullUseCase(fixture.context);
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
});

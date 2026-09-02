import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeleteUseCase } from "../src/use-cases/delete.js";
import { ListObjectsUseCase } from "../src/use-cases/list-objects.js";
import { PushUseCase } from "../src/use-cases/push.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("deletes single objects and directory prefixes recursively with cache eviction", async () => {
		const pushUseCase = new PushUseCase(fixture.context);
		const deleteUseCase = new DeleteUseCase(fixture.context);
		const listUseCase = new ListObjectsUseCase(fixture.context);

		const dir = join(fixture.tempDir, "to-delete");
		mkdirSync(dir, { recursive: true });
		const firstPath = join(dir, "f1.txt");
		const secondPath = join(dir, "f2.txt");
		const singlePath = join(dir, "single.txt");
		writeFileSync(firstPath, "File 1");
		writeFileSync(secondPath, "File 2");
		writeFileSync(singlePath, "Single File");

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
		expect(
			fixture.context.uploadedFileRepo.findByLocalPath(
				"test-profile",
				"test-vault-bucket",
				singlePath,
			),
		).toBeNull();

		// 2. Dry run recursive delete
		const dryRunRes = await deleteUseCase.execute({
			path: "nested/folder",
			recursive: true,
			dryRun: true,
		});
		expect(dryRunRes.deletedCount).toBe(2);
		expect(dryRunRes.dryRun).toBe(true);

		// Objects and upload records are still present after dry-run
		objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(2);
		expect(
			fixture.context.uploadedFileRepo.findByLocalPath(
				"test-profile",
				"test-vault-bucket",
				firstPath,
			),
		).not.toBeNull();

		// 3. Actual recursive delete
		const recRes = await deleteUseCase.execute({
			path: "nested/folder",
			recursive: true,
		});
		expect(recRes.deletedCount).toBe(2);

		objects = await listUseCase.execute({ path: "nested/folder" });
		expect(objects.length).toBe(0);
		for (const localPath of [firstPath, secondPath]) {
			expect(
				fixture.context.uploadedFileRepo.findByLocalPath(
					"test-profile",
					"test-vault-bucket",
					localPath,
				),
			).toBeNull();
		}
	});
});

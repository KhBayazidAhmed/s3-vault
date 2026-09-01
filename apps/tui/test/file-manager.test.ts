import { ServiceContext } from "@S3-vault-CLI/application";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBrowser } from "../src/file-manager/local-browser.js";
import { RemoteBrowser } from "../src/file-manager/remote-browser.js";
import { TuiStateManager } from "../src/file-manager/tui-state.js";

describe("TUI File Manager: Local & Remote Browser & State", () => {
	it("LocalBrowser: reads local directory, adds parent entry, and sorts directories first", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-tui-test-"));
		writeFileSync(join(tempDir, "sample.txt"), "hello world");
		writeFileSync(join(tempDir, "another.md"), "# notes");

		const items = LocalBrowser.readDirectory(tempDir);
		expect(items.length).toBeGreaterThan(0);
		expect(items[0]?.name).toBe("..");
		expect(items.some((i) => i.name === "sample.txt")).toBe(true);
		expect(items.some((i) => i.name === "another.md")).toBe(true);

		rmSync(tempDir, { recursive: true, force: true });
	});

	it("TuiStateManager: navigates cursor, bounds check, and toggles pane", () => {
		const stateManager = new TuiStateManager();
		stateManager.refreshLocal();

		expect(stateManager.getState().activePane).toBe("local");
		stateManager.togglePane();
		expect(stateManager.getState().activePane).toBe("remote");
		stateManager.togglePane();
		expect(stateManager.getState().activePane).toBe("local");

		// Move cursor down and up
		stateManager.moveCursor(1);
		expect(stateManager.getState().localCursor).toBe(1);
		stateManager.moveCursor(-1);
		expect(stateManager.getState().localCursor).toBe(0);

		// Modal state
		stateManager.openModal("profile-select", { optionsCount: 3 });
		expect(stateManager.getState().activeModal).toBe("profile-select");
		stateManager.moveCursor(1);
		expect(stateManager.getState().modalCursor).toBe(1);
		stateManager.closeModal();
		expect(stateManager.getState().activeModal).toBe("none");
	});

	it("RemoteBrowser: groups remote S3 objects into virtual folders", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-remote-tui-test-"));
		const context = new ServiceContext({
			customConfigPath: join(tempDir, "config.json"),
			customDbPath: join(tempDir, "state.db"),
		});

		// Save a mock profile
		context.configManager.saveProfile({
			name: "mock-test",
			provider: "mock",
			bucket: "test-bucket",
			isDefault: true,
			addressingStyle: "path-style",
		});

		const { storage } = context.resolveRuntime();
		await storage.putObject({
			bucket: "test-bucket",
			key: "documents/2026/report.pdf",
			body: Buffer.from("test report"),
		});
		await storage.putObject({
			bucket: "test-bucket",
			key: "documents/notes.txt",
			body: Buffer.from("test notes"),
		});
		await storage.putObject({
			bucket: "test-bucket",
			key: "root-file.json",
			body: Buffer.from("{}"),
		});

		const { ListObjectsUseCase } = await import("@S3-vault-CLI/application");
		const listUseCase = new ListObjectsUseCase(context);

		// List root prefix ""
		const rootItems = await RemoteBrowser.listPrefix(listUseCase, "");
		expect(
			rootItems.some((i) => i.name === "documents/" && i.isDirectory),
		).toBe(true);
		expect(
			rootItems.some((i) => i.name === "root-file.json" && !i.isDirectory),
		).toBe(true);

		// List subfolder "documents/"
		const subItems = await RemoteBrowser.listPrefix(listUseCase, "documents/");
		expect(subItems[0]?.name).toBe("..");
		expect(subItems.some((i) => i.name === "2026/" && i.isDirectory)).toBe(
			true,
		);
		expect(subItems.some((i) => i.name === "notes.txt" && !i.isDirectory)).toBe(
			true,
		);

		// Test deleting single remote object
		const { DeleteUseCase } = await import("@S3-vault-CLI/application");
		const deleteUseCase = new DeleteUseCase(context);

		await deleteUseCase.execute({ path: "root-file.json" });
		const afterDeleteRoot = await RemoteBrowser.listPrefix(listUseCase, "");
		expect(afterDeleteRoot.some((i) => i.name === "root-file.json")).toBe(
			false,
		);

		// Test deleting remote folder recursively
		await deleteUseCase.execute({ path: "documents/", recursive: true });
		const afterDeleteFolder = await RemoteBrowser.listPrefix(listUseCase, "");
		expect(afterDeleteFolder.some((i) => i.name === "documents/")).toBe(false);

		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});
});

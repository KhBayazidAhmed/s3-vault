import { ServiceContext } from "@S3-vault-CLI/application";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TuiStateManager } from "../src/file-manager/tui-state.js";
import { handleModalKey } from "../src/tui-modal-key-handler.js";
import { handleTransferKey } from "../src/tui-transfer-actions.js";

describe("TUI Transfer Actions & Confirmation Modals", () => {
	it("prevents download key 'd' when active pane is local", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-transfer-actions-test-"));
		const context = new ServiceContext({
			customConfigPath: join(tempDir, "config.json"),
			customDbPath: join(tempDir, "state.db"),
		});

		const stateManager = new TuiStateManager(tempDir);
		expect(stateManager.getState().activePane).toBe("local");

		const handled = await handleTransferKey(
			"d",
			stateManager.getState(),
			stateManager,
			context,
		);

		expect(handled).toBe(true);
		expect(stateManager.getState().activeModal).toBe("none");
		expect(stateManager.getState().statusMessage).toContain(
			"Switch to Remote pane",
		);

		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("prevents upload key 'u' when active pane is remote", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-transfer-actions-test-"));
		const context = new ServiceContext({
			customConfigPath: join(tempDir, "config.json"),
			customDbPath: join(tempDir, "state.db"),
		});

		const stateManager = new TuiStateManager(tempDir);
		stateManager.togglePane();
		expect(stateManager.getState().activePane).toBe("remote");

		const handled = await handleTransferKey(
			"u",
			stateManager.getState(),
			stateManager,
			context,
		);

		expect(handled).toBe(true);
		expect(stateManager.getState().statusMessage).toContain(
			"Switch to Local pane",
		);

		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("opens confirm-download modal on 'd' when remote file is selected, and allows cancelling with 'n'", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-transfer-actions-test-"));
		const context = new ServiceContext({
			customConfigPath: join(tempDir, "config.json"),
			customDbPath: join(tempDir, "state.db"),
		});

		const stateManager = new TuiStateManager(tempDir);
		stateManager.togglePane();
		expect(stateManager.getState().activePane).toBe("remote");

		// Populate dummy remote items
		const state = (stateManager as any).state;
		state.remoteItems = [
			{
				name: "archive.zip",
				path: "archive.zip",
				isDirectory: false,
				size: 1048576,
			},
		];

		const handled = await handleTransferKey(
			"d",
			stateManager.getState(),
			stateManager,
			context,
		);

		expect(handled).toBe(true);
		expect(stateManager.getState().activeModal).toBe("confirm-download");
		expect(stateManager.getState().modalData.targetItem.name).toBe(
			"archive.zip",
		);

		// Now press 'n' to cancel
		const modalHandled = await handleModalKey(
			"n",
			stateManager.getState(),
			stateManager,
			context,
		);

		expect(modalHandled).toBe(true);
		expect(stateManager.getState().activeModal).toBe("none");
		expect(stateManager.getState().statusMessage).toContain(
			"Download cancelled",
		);

		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});
});

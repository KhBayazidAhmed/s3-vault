import type { ServiceContext } from "@S3-vault-CLI/application";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { getDualPaneLayout } from "./components/dual-pane-view.js";
import type { TuiStateManager } from "./file-manager/tui-state.js";
import { handleModalKey } from "./tui-modal-key-handler.js";
import { handleNavigationKey } from "./tui-navigation-key-handler.js";
import { handleObjectActionKey } from "./tui-object-actions.js";
import { handleTransferKey } from "./tui-transfer-actions.js";

function isPrintableKey(key: KeyEvent): key is KeyEvent & { sequence: string } {
	return (
		!key.ctrl &&
		!key.meta &&
		!!key.sequence &&
		Array.from(key.sequence).length === 1 &&
		key.sequence >= " " &&
		key.sequence !== "\u007f"
	);
}

export function createTuiKeyHandler(
	renderer: CliRenderer,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	return async (key: KeyEvent) => {
		const state = stateManager.getState();
		const keyName = (key.name || "").toLowerCase();
		const termWidth = process.stdout.columns || renderer.width || 80;
		const termHeight = process.stdout.rows || renderer.height || 24;
		const { visibleRows } = getDualPaneLayout(termWidth, termHeight);

		if (key.ctrl && keyName === "c") {
			renderer.destroy();
			process.exit(0);
		}
		if (keyName === "escape") {
			if (state.activeModal !== "none") {
				stateManager.closeModal();
				stateManager.setStatus("Action cancelled.", "info");
			} else if (state.searchActive || state.searchQuery) {
				stateManager.clearSearch();
				stateManager.setStatus("Search cleared.", "info");
			}
			return;
		}
		if (await handleModalKey(keyName, state, stateManager, context)) return;

		if (state.searchActive) {
			if (keyName === "return") {
				stateManager.finishSearch();
				stateManager.setStatus(
					state.searchQuery
						? `Filtered ${state.searchPane} files by “${state.searchQuery}”. Press Esc to clear.`
						: "Search closed.",
					"info",
				);
				return;
			}
			if (keyName === "backspace") {
				stateManager.deleteSearchCharacter();
				return;
			}
			if (isPrintableKey(key)) {
				stateManager.appendSearch(key.sequence);
				return;
			}
		}

		if (keyName === "q") {
			renderer.destroy();
			process.exit(0);
		}
		if (keyName === "/" || key.sequence === "/") {
			stateManager.startSearch();
			stateManager.setStatus(
				`Searching ${state.activePane} files. Type a name, Enter to keep, Esc to clear.`,
				"info",
			);
			return;
		}
		if (
			handleNavigationKey(
				keyName,
				!!key.shift,
				visibleRows,
				state,
				stateManager,
				context,
			)
		)
			return;
		if (await handleTransferKey(keyName, state, stateManager, context)) return;
		if (await handleObjectActionKey(keyName, state, stateManager, context))
			return;

		if (isPrintableKey(key)) {
			stateManager.startSearch(key.sequence);
			stateManager.setStatus(
				`Searching ${state.activePane} files. Type a name, Enter to keep, Esc to clear.`,
				"info",
			);
		}
	};
}

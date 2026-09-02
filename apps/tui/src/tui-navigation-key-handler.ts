import type { ServiceContext } from "@S3-vault-CLI/application";
import type { TuiStateManager } from "./file-manager/tui-state.js";
import type { TuiState } from "./file-manager/types.js";

export function handleNavigationKey(
	keyName: string,
	shift: boolean,
	visibleRows: number,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
): boolean {
	if (keyName === "tab") {
		stateManager.togglePane();
		stateManager.setStatus(
			`Active: ${state.activePane === "local" ? "Local Files" : "Remote Storage"}`,
			"info",
		);
		return true;
	}
	if (keyName === "up" || keyName === "k") {
		stateManager.moveCursor(-1, visibleRows);
		return true;
	}
	if (keyName === "down" || keyName === "j") {
		stateManager.moveCursor(1, visibleRows);
		return true;
	}
	if (keyName === "pageup") {
		stateManager.moveCursor(-10, visibleRows);
		return true;
	}
	if (keyName === "pagedown") {
		stateManager.moveCursor(10, visibleRows);
		return true;
	}
	if (keyName === "home" || (keyName === "g" && !shift)) {
		stateManager.jumpToTop();
		return true;
	}
	if (keyName === "end" || (keyName === "g" && shift)) {
		stateManager.jumpToBottom(visibleRows);
		return true;
	}
	if (keyName === "backspace" || keyName === "left" || keyName === "h") {
		stateManager.navigateUp(context);
		return true;
	}
	if (keyName === "return" || keyName === "right" || keyName === "l") {
		openSelectedItem(state, stateManager, context);
		return true;
	}
	return false;
}

function openSelectedItem(
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	const item = stateManager.getSelectedItem();
	if (!item) return;
	if (state.activePane === "local") {
		if (item.isDirectory) {
			stateManager.setLocalPath(item.path);
			stateManager.setStatus(`Browsing local: ${item.path}`, "info");
			return;
		}
		const uploadDetail =
			item.uploadStatus === "uploaded"
				? ` Uploaded to ${item.uploadedDestination}.`
				: item.uploadStatus === "changed"
					? " Changed since its last upload."
					: item.uploadStatus === "renamed"
						? ` Renamed since upload to ${item.uploadedDestination}.`
						: "";
		stateManager.setStatus(
			`Selected local file: ${item.name} (${item.size} bytes).${uploadDetail} Press [U] to upload.`,
			item.uploadStatus === "changed" || item.uploadStatus === "renamed"
				? "warning"
				: "info",
		);
		return;
	}
	if (item.isDirectory) {
		stateManager.setRemotePrefix(item.path, context);
		stateManager.setStatus(
			`Browsing remote prefix: ${item.path || "(root)"}`,
			"info",
		);
	} else {
		stateManager.setStatus(
			`Selected remote object: ${item.name}. Press [D] to download, [S] to share.`,
			"info",
		);
	}
}

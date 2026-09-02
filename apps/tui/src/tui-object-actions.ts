import { type ServiceContext, ShareUseCase } from "@S3-vault-CLI/application";
import { ClipboardUtils } from "@S3-vault-CLI/output";
import type { TuiStateManager } from "./file-manager/tui-state.js";
import type { TuiState } from "./file-manager/types.js";

export async function handleObjectActionKey(
	keyName: string,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
): Promise<boolean> {
	if (keyName === "s") {
		await shareSelected(stateManager, context);
		return true;
	}
	if (keyName === "p") {
		stateManager.openModal("profile-select", {
			optionsCount: state.availableProfiles.length + 1,
		});
		return true;
	}
	if (keyName === "delete" || keyName === "backspace" || keyName === "x") {
		const item = stateManager.getSelectedItem();
		if (!item || item.name === "..") {
			stateManager.setStatus("No valid item selected to delete.", "warning");
			return true;
		}
		stateManager.openModal("confirm-delete", {
			targetItem: item,
			isRemote: state.activePane === "remote",
		});
		return true;
	}
	if (keyName === "r") {
		stateManager.refreshLocal();
		await stateManager.refreshRemote(context);
		stateManager.setStatus("Refreshed local & remote files.", "info");
		return true;
	}
	return false;
}

async function shareSelected(
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	const item = stateManager.getSelectedItem("remote");
	if (!item || item.isDirectory || item.name === "..") {
		stateManager.setStatus(
			"Select a remote file to generate a share URL.",
			"warning",
		);
		return;
	}
	try {
		const result = await new ShareUseCase(context).execute({
			key: item.path,
			expiresInSeconds: 3600,
		});
		await ClipboardUtils.copy(result.url);
		stateManager.openModal("share-link", {
			targetItem: item,
			url: result.url,
		});
	} catch (error: unknown) {
		stateManager.setStatus(
			`Failed to generate share URL: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

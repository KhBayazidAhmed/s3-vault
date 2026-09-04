import {
	DeleteUseCase,
	InitProfileUseCase,
	type ServiceContext,
} from "@S3-vault-CLI/application";
import { rmSync } from "node:fs";
import type { TuiStateManager } from "./file-manager/tui-state.js";
import type { TuiState } from "./file-manager/types.js";
import { downloadSelected } from "./tui-transfer-actions.js";

export async function handleModalKey(
	keyName: string,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
): Promise<boolean> {
	if (state.activeModal === "profile-select") {
		if (keyName === "up" || keyName === "k") {
			stateManager.moveCursor(-1);
		} else if (keyName === "down" || keyName === "j") {
			stateManager.moveCursor(1);
		} else if (keyName === "return") {
			await selectProfile(state, stateManager, context);
		}
		return true;
	}
	if (state.activeModal === "confirm-delete") {
		await confirmDelete(keyName, state, stateManager, context);
		return true;
	}
	if (state.activeModal === "confirm-download") {
		await confirmDownload(keyName, state, stateManager, context);
		return true;
	}
	if (state.activeModal === "share-link") {
		if (keyName === "return" || keyName === "escape") stateManager.closeModal();
		return true;
	}
	return false;
}

async function selectProfile(
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	const selectedIndex = state.modalCursor;
	if (selectedIndex < state.availableProfiles.length) {
		const chosen = state.availableProfiles[selectedIndex];
		if (!chosen) return;
		context.configManager.setActiveProfile(chosen.name);
		stateManager.closeModal();
		stateManager.setStatus(
			`Switched active profile to '${chosen.name}'`,
			"success",
		);
		await stateManager.refreshRemote(context);
		return;
	}
	try {
		const profileName = `sandbox-${Date.now().toString().slice(-4)}`;
		await new InitProfileUseCase(context).execute({
			name: profileName,
			provider: "mock",
			bucket: "sandbox-vault",
			isDefault: true,
		});
		context.configManager.setActiveProfile(profileName);
		stateManager.closeModal();
		stateManager.setStatus(
			`Created & activated mock sandbox profile '${profileName}'!`,
			"success",
		);
		await stateManager.refreshRemote(context);
	} catch (error: unknown) {
		stateManager.setStatus(
			`Failed to create profile: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function confirmDelete(
	keyName: string,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	if (keyName === "n") {
		stateManager.closeModal();
		stateManager.setStatus("Delete cancelled.", "info");
		return;
	}
	if (keyName !== "y") return;

	const target = state.modalData?.targetItem;
	const isRemote = state.modalData?.isRemote;
	stateManager.closeModal();
	if (!target) return;
	try {
		if (isRemote) {
			const result = await new DeleteUseCase(context).execute({
				path: target.path,
				recursive: target.isDirectory,
			});
			stateManager.setStatus(
				target.isDirectory
					? `Deleted remote folder '${target.name}' (${result.deletedCount} object(s))`
					: `Deleted remote object: ${target.name}`,
				"success",
			);
			await stateManager.refreshRemote(context);
		} else {
			rmSync(target.path, { recursive: true, force: true });
			stateManager.setStatus(
				target.isDirectory
					? `Deleted local directory: ${target.name}`
					: `Deleted local file: ${target.name}`,
				"success",
			);
			stateManager.refreshLocal();
		}
	} catch (error: unknown) {
		stateManager.setStatus(
			`Delete failed: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function confirmDownload(
	keyName: string,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	if (keyName === "n" || keyName === "escape") {
		stateManager.closeModal();
		stateManager.setStatus("Download cancelled.", "info");
		return;
	}
	if (keyName !== "y" && keyName !== "return") return;

	stateManager.closeModal();
	await downloadSelected(state, stateManager, context);
}

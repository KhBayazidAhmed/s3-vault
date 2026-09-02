import {
	PullUseCase,
	PushUseCase,
	type ServiceContext,
} from "@S3-vault-CLI/application";
import { join } from "node:path";
import type { TuiStateManager } from "./file-manager/tui-state.js";
import type { TuiState } from "./file-manager/types.js";

export async function handleTransferKey(
	keyName: string,
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
): Promise<boolean> {
	if (keyName === "u") {
		await uploadSelected(state, stateManager, context);
		return true;
	}
	if (keyName === "d") {
		await downloadSelected(state, stateManager, context);
		return true;
	}
	return false;
}

async function uploadSelected(
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	const item = stateManager.getSelectedItem("local");
	if (!item) {
		stateManager.setStatus("Please select a local file to upload.", "warning");
		return;
	}
	if (item.name === "..") {
		stateManager.setStatus(
			"Cannot upload parent directory reference.",
			"warning",
		);
		return;
	}
	if (state.availableProfiles.length === 0) {
		stateManager.setStatus(
			"No storage profile set. Press [P] to create a profile first.",
			"warning",
		);
		return;
	}
	try {
		stateManager.setProgress({
			active: true,
			label: `Uploading ${item.name}`,
			transferredBytes: 0,
			totalBytes: item.size,
			percentage: 0,
		});
		const targetKey = state.remotePrefix
			? `${state.remotePrefix}${item.name}`
			: item.name;
		const result = await new PushUseCase(context).execute({
			source: item.path,
			target: targetKey,
			recursive: item.isDirectory,
			onProgress: (progress) => {
				stateManager.setProgress({
					active: true,
					label: `Uploading ${item.name}`,
					transferredBytes: progress.transferredBytes ?? 0,
					totalBytes: progress.totalBytes ?? item.size,
				});
			},
		});
		stateManager.clearProgress();
		if (result.success) {
			stateManager.setStatus(
				`Successfully uploaded '${item.name}' to s3://${state.activeBucket}/${targetKey}!`,
				"success",
			);
			await stateManager.refreshRemote(context);
		} else {
			stateManager.setStatus(
				`Upload error: ${result.errors[0]?.message || "Unknown error"}`,
				"error",
			);
		}
	} catch (error: unknown) {
		stateManager.clearProgress();
		stateManager.setStatus(
			`Upload failed: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

async function downloadSelected(
	state: Readonly<TuiState>,
	stateManager: TuiStateManager,
	context: ServiceContext,
) {
	const item = stateManager.getSelectedItem("remote");
	if (!item) {
		stateManager.setStatus(
			"Please select a remote object to download.",
			"warning",
		);
		return;
	}
	if (item.name === "..") {
		stateManager.setStatus(
			"Cannot download parent directory reference.",
			"warning",
		);
		return;
	}
	try {
		stateManager.setProgress({
			active: true,
			label: `Downloading ${item.name}`,
			transferredBytes: 0,
			totalBytes: item.size,
			percentage: 0,
		});
		const targetLocalPath = join(state.localPath, item.name);
		const result = await new PullUseCase(context).execute({
			source: item.path,
			target: targetLocalPath,
			recursive: item.isDirectory,
			onProgress: (progress) => {
				stateManager.setProgress({
					active: true,
					label: `Downloading ${item.name}`,
					transferredBytes: progress.transferredBytes ?? 0,
					totalBytes: progress.totalBytes ?? item.size,
				});
			},
		});
		stateManager.clearProgress();
		if (result.success) {
			stateManager.setStatus(
				`Successfully downloaded '${item.name}' to ${targetLocalPath}!`,
				"success",
			);
			stateManager.refreshLocal();
		} else {
			stateManager.setStatus(
				`Download error: ${result.errors[0]?.message || "Unknown error"}`,
				"error",
			);
		}
	} catch (error: unknown) {
		stateManager.clearProgress();
		stateManager.setStatus(
			`Download failed: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}

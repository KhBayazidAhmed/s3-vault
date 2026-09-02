import {
	DeleteUseCase,
	InitProfileUseCase,
	PullUseCase,
	PushUseCase,
	type ServiceContext,
	ShareUseCase,
} from "@S3-vault-CLI/application";
import { ClipboardUtils } from "@S3-vault-CLI/output";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { BoxRenderable, createCliRenderer, type KeyEvent } from "@opentui/core";
import {
	createDualPaneView,
	getDualPaneLayout,
} from "./components/dual-pane-view.js";
import { createModalView } from "./components/modal-view.js";
import {
	createBottomBarView,
	createHeaderView,
} from "./components/shortcut-bar.js";
import { TuiStateManager } from "./file-manager/tui-state.js";

export async function runInteractiveTui(context: ServiceContext) {
	const renderer = await createCliRenderer({ exitOnCtrlC: true });
	const stateManager = new TuiStateManager(process.cwd());

	// Persistent View Components
	const headerView = createHeaderView(renderer);
	const modalView = createModalView(renderer);
	const dualPaneView = createDualPaneView(renderer);
	const bottomBarView = createBottomBarView(renderer);

	const rootBox = new BoxRenderable(renderer, {
		flexDirection: "column",
		flexGrow: 1,
		padding: 1,
		width: "100%",
	});
	rootBox.add(headerView.container);
	rootBox.add(modalView.container);
	rootBox.add(dualPaneView.container);
	rootBox.add(bottomBarView.container);

	renderer.root.add(rootBox);

	const renderApp = () => {
		const state = stateManager.getState();
		headerView.update(state);
		modalView.update(state);
		dualPaneView.update(state);
		bottomBarView.update(state);
		dualPaneView.container.visible = state.activeModal === "none";
	};

	// Reactive Subscriptions
	stateManager.subscribe(() => {
		renderApp();
	});

	process.stdout.on("resize", () => {
		renderApp();
	});

	// Initial data loading
	stateManager.refreshLocal();
	await stateManager.refreshRemote(context);
	renderApp();

	// Global Keyboard Event Routing
	renderer.keyInput.on("keypress", async (key: KeyEvent) => {
		const state = stateManager.getState();
		const keyName = (key.name || "").toLowerCase();
		const termWidth = process.stdout.columns || renderer.width || 80;
		const termHeight = process.stdout.rows || renderer.height || 24;
		const { visibleRows } = getDualPaneLayout(termWidth, termHeight);

		// Handle Exit
		if (
			(key.ctrl && keyName === "c") ||
			(state.activeModal === "none" && keyName === "q")
		) {
			renderer.destroy();
			process.exit(0);
		}

		// Handle Modal Close / Escape
		if (keyName === "escape") {
			if (state.activeModal !== "none") {
				stateManager.closeModal();
				stateManager.setStatus("Action cancelled.", "info");
			}
			return;
		}

		// Modal Interactions
		if (state.activeModal === "profile-select") {
			if (keyName === "up" || keyName === "k") {
				stateManager.moveCursor(-1);
			} else if (keyName === "down" || keyName === "j") {
				stateManager.moveCursor(1);
			} else if (keyName === "return") {
				const selectedIdx = state.modalCursor;
				if (selectedIdx < state.availableProfiles.length) {
					const chosen = state.availableProfiles[selectedIdx];
					if (chosen) {
						context.configManager.setActiveProfile(chosen.name);
						stateManager.closeModal();
						stateManager.setStatus(
							`Switched active profile to '${chosen.name}'`,
							"success",
						);
						await stateManager.refreshRemote(context);
					}
				} else {
					// Create Instant Demo Mock profile
					try {
						const initUseCase = new InitProfileUseCase(context);
						const profileName = `sandbox-${Date.now().toString().slice(-4)}`;
						await initUseCase.execute({
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
					} catch (err: unknown) {
						stateManager.setStatus(
							`Failed to create profile: ${err instanceof Error ? err.message : String(err)}`,
							"error",
						);
					}
				}
			}
			return;
		}

		if (state.activeModal === "confirm-delete") {
			if (keyName === "y") {
				const target = state.modalData?.targetItem;
				const isRemote = state.modalData?.isRemote;
				stateManager.closeModal();

				if (target) {
					try {
						if (isRemote) {
							const deleteUseCase = new DeleteUseCase(context);
							const res = await deleteUseCase.execute({
								path: target.path,
								recursive: target.isDirectory,
							});
							stateManager.setStatus(
								target.isDirectory
									? `Deleted remote folder '${target.name}' (${res.deletedCount} object(s))`
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
					} catch (err: unknown) {
						stateManager.setStatus(
							`Delete failed: ${err instanceof Error ? err.message : String(err)}`,
							"error",
						);
					}
				}
			} else if (keyName === "n") {
				stateManager.closeModal();
				stateManager.setStatus("Delete cancelled.", "info");
			}
			return;
		}

		if (state.activeModal === "share-link") {
			if (keyName === "return" || keyName === "escape") {
				stateManager.closeModal();
			}
			return;
		}

		// ── Normal Dual-Pane Navigation ──

		// Tab -> Switch pane
		if (keyName === "tab") {
			stateManager.togglePane();
			stateManager.setStatus(
				`Active: ${state.activePane === "local" ? "Local Files" : "Remote Storage"}`,
				"info",
			);
			return;
		}

		// Navigation: Up / Down / Vim keys / PageUp / PageDown
		if (keyName === "up" || keyName === "k") {
			stateManager.moveCursor(-1, visibleRows);
			return;
		}
		if (keyName === "down" || keyName === "j") {
			stateManager.moveCursor(1, visibleRows);
			return;
		}
		if (keyName === "pageup") {
			stateManager.moveCursor(-10, visibleRows);
			return;
		}
		if (keyName === "pagedown") {
			stateManager.moveCursor(10, visibleRows);
			return;
		}
		if (keyName === "home" || (keyName === "g" && !key.shift)) {
			stateManager.jumpToTop();
			return;
		}
		if (keyName === "end" || (keyName === "g" && key.shift)) {
			stateManager.jumpToBottom(visibleRows);
			return;
		}

		// Backspace / Left / h -> Navigate up to parent directory
		if (keyName === "backspace" || keyName === "left" || keyName === "h") {
			stateManager.navigateUp(context);
			return;
		}

		// Enter / Right / l -> Open folder / navigate / select
		if (keyName === "return" || keyName === "right" || keyName === "l") {
			const item = stateManager.getSelectedItem();
			if (!item) return;

			if (state.activePane === "local") {
				if (item.isDirectory) {
					stateManager.setLocalPath(item.path);
					stateManager.setStatus(`Browsing local: ${item.path}`, "info");
				} else {
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
				}
			} else {
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
			return;
		}

		// [U] -> Upload selected local file / folder
		if (keyName === "u") {
			const item =
				state.activePane === "local"
					? stateManager.getSelectedItem()
					: state.localItems[state.localCursor];

			if (!item) {
				stateManager.setStatus(
					"Please select a local file to upload.",
					"warning",
				);
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

				const pushUseCase = new PushUseCase(context);
				const targetKey = state.remotePrefix
					? `${state.remotePrefix}${item.name}`
					: item.name;

				const res = await pushUseCase.execute({
					source: item.path,
					target: targetKey,
					recursive: item.isDirectory,
					onProgress: (p) => {
						stateManager.setProgress({
							active: true,
							label: `Uploading ${item.name}`,
							transferredBytes: p.transferredBytes ?? 0,
							totalBytes: p.totalBytes ?? item.size,
						});
					},
				});

				stateManager.clearProgress();
				if (res.success) {
					stateManager.setStatus(
						`Successfully uploaded '${item.name}' to s3://${state.activeBucket}/${targetKey}!`,
						"success",
					);
					await stateManager.refreshRemote(context);
				} else {
					stateManager.setStatus(
						`Upload error: ${res.errors[0]?.message || "Unknown error"}`,
						"error",
					);
				}
			} catch (err: unknown) {
				stateManager.clearProgress();
				stateManager.setStatus(
					`Upload failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
			return;
		}

		// [D] -> Download selected remote object / folder
		if (keyName === "d") {
			const item =
				state.activePane === "remote"
					? stateManager.getSelectedItem()
					: state.remoteItems[state.remoteCursor];

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

				const pullUseCase = new PullUseCase(context);
				const targetLocalPath = join(state.localPath, item.name);

				const res = await pullUseCase.execute({
					source: item.path,
					target: targetLocalPath,
					recursive: item.isDirectory,
					onProgress: (p) => {
						stateManager.setProgress({
							active: true,
							label: `Downloading ${item.name}`,
							transferredBytes: p.transferredBytes ?? 0,
							totalBytes: p.totalBytes ?? item.size,
						});
					},
				});

				stateManager.clearProgress();
				if (res.success) {
					stateManager.setStatus(
						`Successfully downloaded '${item.name}' to ${targetLocalPath}!`,
						"success",
					);
					stateManager.refreshLocal();
				} else {
					stateManager.setStatus(
						`Download error: ${res.errors[0]?.message || "Unknown error"}`,
						"error",
					);
				}
			} catch (err: unknown) {
				stateManager.clearProgress();
				stateManager.setStatus(
					`Download failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
			return;
		}

		// [S] -> Generate Presigned Share URL
		if (keyName === "s") {
			const item =
				state.activePane === "remote"
					? stateManager.getSelectedItem()
					: state.remoteItems[state.remoteCursor];

			if (!item || item.isDirectory || item.name === "..") {
				stateManager.setStatus(
					"Select a remote file to generate a share URL.",
					"warning",
				);
				return;
			}

			try {
				const shareUseCase = new ShareUseCase(context);
				const res = await shareUseCase.execute({
					key: item.path,
					expiresInSeconds: 3600,
				});

				await ClipboardUtils.copy(res.url);

				stateManager.openModal("share-link", {
					targetItem: item,
					url: res.url,
				});
			} catch (err: unknown) {
				stateManager.setStatus(
					`Failed to generate share URL: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
			return;
		}

		// [P] -> Profiles Manager Modal
		if (keyName === "p") {
			stateManager.openModal("profile-select", {
				optionsCount: state.availableProfiles.length + 1,
			});
			return;
		}

		// [Delete] / [Backspace] / [X] -> Delete confirmation
		if (keyName === "delete" || keyName === "backspace" || keyName === "x") {
			const item = stateManager.getSelectedItem();
			if (!item || item.name === "..") {
				stateManager.setStatus("No valid item selected to delete.", "warning");
				return;
			}

			stateManager.openModal("confirm-delete", {
				targetItem: item,
				isRemote: state.activePane === "remote",
			});
			return;
		}

		// [R] -> Refresh both panes
		if (keyName === "r") {
			stateManager.refreshLocal();
			await stateManager.refreshRemote(context);
			stateManager.setStatus("Refreshed local & remote files.", "info");
			return;
		}
	});
}

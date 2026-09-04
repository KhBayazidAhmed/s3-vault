import { Formatter } from "@S3-vault-CLI/output";
import {
	BoxRenderable,
	bold,
	type CliRenderer,
	cyan,
	dim,
	green,
	RGBA,
	red,
	StyledText,
	type TextChunk,
	TextRenderable,
	t,
	underline,
	yellow,
} from "@opentui/core";
import type { TuiState } from "../file-manager/types.js";

export function createModalView(renderer: CliRenderer) {
	const modalText = new TextRenderable(renderer, { content: "" });

	const container = new BoxRenderable(renderer, {
		flexDirection: "column",
		border: true,
		borderStyle: "rounded",
		borderColor: "#eab308",
		title: " 🔐 DIALOG ",
		titleAlignment: "left",
		paddingX: 1,
		marginBottom: 1,
		width: "100%",
		visible: false,
	});
	container.add(modalText);

	const update = (state: TuiState) => {
		if (state.activeModal === "none") {
			container.visible = false;
			return;
		}

		container.visible = true;

		if (state.activeModal === "profile-select") {
			container.title = " 🔐 STORAGE PROFILES ";
			container.borderColor = RGBA.fromHex("#eab308");

			const profiles = state.availableProfiles;
			const chunks: TextChunk[] = [];
			const header = t`Select a cloud storage profile or create an instant mock sandbox:\n\n`;
			chunks.push(...header.chunks);

			profiles.forEach((p, idx) => {
				const isSelected = idx === state.modalCursor;
				const activeBadge = p.isActive ? green(" (active)") : "";
				const defaultBadge = p.isDefault ? yellow(" [default]") : "";
				const provider = dim(`[${p.provider}: ${p.bucket}]`);

				let lineChunk: StyledText;
				if (isSelected) {
					lineChunk = t`${green(bold("❯ "))}${cyan(bold(`${idx + 1}. ${p.name}`))} ${provider}${activeBadge}${defaultBadge}\n`;
				} else {
					lineChunk = t`  ${idx + 1}. ${p.name} ${provider}${activeBadge}${defaultBadge}\n`;
				}
				chunks.push(...lineChunk.chunks);
			});

			chunks.push({ __isChunk: true, text: "\n" });
			const newProfileIdx = profiles.length;
			const isNewSelected = state.modalCursor === newProfileIdx;
			if (isNewSelected) {
				const newChunk = t`${green(bold("❯ "))}${cyan(bold(`${newProfileIdx + 1}. ➕ Create Instant Mock Sandbox Profile`))}\n\n`;
				chunks.push(...newChunk.chunks);
			} else {
				const newChunk = t`  ${newProfileIdx + 1}. ➕ Create Instant Mock Sandbox Profile\n\n`;
				chunks.push(...newChunk.chunks);
			}

			const footer = t`${dim("Controls: [↑/↓, j/k] Navigate  •  [Enter] Confirm  •  [Esc] Cancel")}`;
			chunks.push(...footer.chunks);

			modalText.content = new StyledText(chunks);
			return;
		}

		if (state.activeModal === "confirm-delete") {
			container.title = " ⚠️ CONFIRM DELETION ";
			container.borderColor = RGBA.fromHex("#ef4444");

			const target = state.modalData?.targetItem?.name || "selected item";
			const isRemote = state.modalData?.isRemote;
			const scope = dim(
				isRemote ? "(from cloud storage)" : "(from local disk)",
			);

			modalText.content = t`Are you sure you want to permanently delete:\n  ${red(bold(target))} ${scope}?\n\n${bold("Press [Y] to Confirm Delete  •  [N] / [Esc] to Cancel")}`;
			return;
		}

		if (state.activeModal === "confirm-download") {
			container.title = " ⬇️ CONFIRM DOWNLOAD ";
			container.borderColor = RGBA.fromHex("#00e5ff");

			const target = state.modalData?.targetItem?.name || "selected item";
			const sizeBytes = state.modalData?.targetItem?.size ?? 0;
			const isDir = state.modalData?.targetItem?.isDirectory;
			const formattedSize = isDir
				? "directory"
				: Formatter.formatBytes(sizeBytes);
			const targetPath = state.localPath;

			modalText.content = t`Download remote ${isDir ? "directory" : "object"}:\n  ${cyan(bold(target))} (${formattedSize})\n\nInto local destination:\n  ${dim(targetPath)}\n\n${bold("Press [Y] to Confirm Download  •  [N] / [Esc] to Cancel")}`;
			return;
		}

		if (state.activeModal === "share-link") {
			container.title = " 🔗 TEMPORARY SHARE LINK ";
			container.borderColor = RGBA.fromHex("#10b981");

			const url = state.modalData?.url || "Generating presigned URL...";
			const target = state.modalData?.targetItem?.name || "object";

			modalText.content = t`Object: ${bold(target)} ${dim("(Temporary Link valid for 1 hour)")}\n\n  ${cyan(underline(url))}\n\n${dim("Copy this link to your browser or share with team.")}\n${bold("Press [Esc] / [Enter] to Close")}`;
			return;
		}
	};

	return { container, update };
}

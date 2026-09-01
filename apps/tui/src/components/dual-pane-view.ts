import { Formatter } from "@S3-vault-CLI/output";
import {
	BoxRenderable,
	blue,
	bold,
	type CliRenderer,
	cyan,
	dim,
	green,
	RGBA,
	StyledText,
	type TextChunk,
	TextRenderable,
	t,
	yellow,
} from "@opentui/core";
import type { FileItem, TuiState } from "../file-manager/types.js";

function truncateMiddle(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	const half = Math.max(2, Math.floor((maxLen - 3) / 2));
	return `${str.slice(0, half)}...${str.slice(str.length - half)}`;
}

function truncateFileName(name: string, maxLen: number): string {
	if (name.length <= maxLen) return name;
	if (maxLen <= 4) return name.slice(0, maxLen);
	return `${name.slice(0, maxLen - 3)}...`;
}

function getFileIcon(name: string, isDirectory: boolean): string {
	if (name === "..") return "⤴ ";
	if (isDirectory) return "📁";
	const lower = name.toLowerCase();
	if (
		lower.endsWith(".mp4") ||
		lower.endsWith(".mov") ||
		lower.endsWith(".avi") ||
		lower.endsWith(".mkv") ||
		lower.endsWith(".webm")
	)
		return "🎬";
	if (
		lower.endsWith(".png") ||
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".svg") ||
		lower.endsWith(".gif") ||
		lower.endsWith(".webp") ||
		lower.endsWith(".ico")
	)
		return "🖼 ";
	if (
		lower.endsWith(".ts") ||
		lower.endsWith(".js") ||
		lower.endsWith(".tsx") ||
		lower.endsWith(".jsx") ||
		lower.endsWith(".json") ||
		lower.endsWith(".md") ||
		lower.endsWith(".txt") ||
		lower.endsWith(".html") ||
		lower.endsWith(".css") ||
		lower.endsWith(".yaml") ||
		lower.endsWith(".yml") ||
		lower.endsWith(".sh")
	)
		return "📝";
	if (
		lower.endsWith(".zip") ||
		lower.endsWith(".tar") ||
		lower.endsWith(".gz") ||
		lower.endsWith(".7z") ||
		lower.endsWith(".rar") ||
		lower.endsWith(".dmg") ||
		lower.endsWith(".pkg")
	)
		return "📦";
	return "📄";
}

export function formatPaneRows(
	items: FileItem[],
	cursor: number,
	scrollOffset: number,
	isActivePane: boolean,
	emptyMessage: string,
	paneWidth: number,
	visibleRows = 14,
): StyledText {
	if (items.length === 0) {
		return t`\n  ${dim(emptyMessage)}\n`;
	}

	const allChunks: TextChunk[] = [];
	const end = Math.min(items.length, scrollOffset + visibleRows);

	const showDate = paneWidth >= 46;
	const dateColWidth = showDate ? 14 : 0;
	const sizeColWidth = 10;
	// Layout per line: prefix(2) + icon(2) + space(1) + name(nameWidth) + space(2) + size(10) + [space(2) + date(14)]
	const fixedWidth =
		2 + 2 + 1 + 2 + sizeColWidth + (showDate ? 2 + dateColWidth : 0);
	const nameWidth = Math.max(10, paneWidth - fixedWidth - 4);

	// Top scroll indicator
	if (scrollOffset > 0) {
		const topIndicator = t`  ${yellow(`▲ (${scrollOffset} more items above)`)}`;
		allChunks.push(...topIndicator.chunks, { __isChunk: true, text: "\n" });
	}

	for (let i = scrollOffset; i < end; i++) {
		const item = items[i];
		if (!item) continue;

		const isSelected = i === cursor;
		const isParent = item.name === "..";
		const isDir = item.isDirectory;

		const icon = getFileIcon(item.name, isDir);
		const truncated = truncateFileName(item.name, nameWidth);
		const paddedName = truncated.padEnd(nameWidth, " ");

		const sizeText = isDir ? "<DIR>" : Formatter.formatBytes(item.size);
		const sizeStr = sizeText.padStart(sizeColWidth, " ");
		const dateStr =
			showDate && item.modifiedAt
				? (item.modifiedAt || "").padStart(dateColWidth, " ")
				: "";

		let lineChunk: StyledText;
		if (isSelected && isActivePane) {
			const prefix = green(bold("❯ "));
			const nameChunk = cyan(bold(paddedName));
			const sizeChunk = isDir ? dim(sizeStr) : yellow(bold(sizeStr));
			const dateChunk = showDate ? dim(`  ${dateStr}`) : "";
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${dateChunk}`;
		} else if (isSelected && !isActivePane) {
			const prefix = dim("› ");
			const nameChunk = isDir || isParent ? blue(bold(paddedName)) : paddedName;
			const sizeChunk = isDir ? dim(sizeStr) : yellow(sizeStr);
			const dateChunk = showDate ? dim(`  ${dateStr}`) : "";
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${dateChunk}`;
		} else {
			const prefix = "  ";
			const nameChunk =
				isDir || isParent
					? blue(bold(paddedName))
					: item.name.startsWith(".")
						? dim(paddedName)
						: paddedName;
			const sizeChunk = isDir ? dim(sizeStr) : yellow(sizeStr);
			const dateChunk = showDate ? dim(`  ${dateStr}`) : "";
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${dateChunk}`;
		}

		allChunks.push(...lineChunk.chunks, { __isChunk: true, text: "\n" });
	}

	// Bottom scroll indicator
	const remaining = items.length - end;
	if (remaining > 0) {
		const botIndicator = t`  ${yellow(`▼ (${remaining} more items below)`)}`;
		allChunks.push(...botIndicator.chunks, { __isChunk: true, text: "\n" });
	}

	// Pad lines to maintain stable height
	const totalRendered = allChunks.filter((c) => c.text === "\n").length;
	for (let p = totalRendered; p < visibleRows; p++) {
		allChunks.push({ __isChunk: true, text: "\n" });
	}

	return new StyledText(allChunks);
}

export function createDualPaneView(renderer: CliRenderer) {
	const leftText = new TextRenderable(renderer, { content: "" });
	const rightText = new TextRenderable(renderer, { content: "" });

	const leftBox = new BoxRenderable(renderer, {
		flexDirection: "column",
		flexGrow: 1,
		width: "50%",
		border: true,
		borderStyle: "rounded",
		borderColor: "#00e5ff",
		title: " 📂 LOCAL ",
		titleAlignment: "left",
		paddingX: 1,
	});
	leftBox.add(leftText);

	const rightBox = new BoxRenderable(renderer, {
		flexDirection: "column",
		flexGrow: 1,
		width: "50%",
		border: true,
		borderStyle: "rounded",
		borderColor: "#444444",
		title: " ☁️ REMOTE ",
		titleAlignment: "left",
		paddingX: 1,
	});
	rightBox.add(rightText);

	const container = new BoxRenderable(renderer, {
		flexDirection: "row",
		flexGrow: 1,
		gap: 1,
		width: "100%",
	});
	container.add(leftBox);
	container.add(rightBox);

	const update = (state: TuiState) => {
		const termWidth = renderer.width || process.stdout.columns || 80;
		const termHeight = renderer.height || process.stdout.rows || 24;

		const paneWidth = Math.max(28, Math.floor((termWidth - 6) / 2));
		const visibleRows = Math.max(6, termHeight - 12);

		const isLocalActive = state.activePane === "local";
		const isRemoteActive = state.activePane === "remote";

		// Update Left Box (Local)
		leftBox.borderColor = RGBA.fromHex(isLocalActive ? "#00e5ff" : "#444444");
		leftBox.title = ` 📂 LOCAL: ${truncateMiddle(state.localPath, Math.max(10, paneWidth - 16))} (${state.localItems.length}) `;
		leftText.content = formatPaneRows(
			state.localItems,
			state.localCursor,
			state.localScrollOffset,
			isLocalActive,
			"Folder is empty.",
			paneWidth,
			visibleRows,
		);

		// Update Right Box (Remote)
		const remotePathDisplay = state.activeBucket
			? `s3://${state.activeBucket}/${state.remotePrefix}`
			: "No Profile";
		rightBox.borderColor = RGBA.fromHex(isRemoteActive ? "#00e5ff" : "#444444");
		rightBox.title = ` ☁️ REMOTE: ${truncateMiddle(remotePathDisplay, Math.max(10, paneWidth - 16))} (${state.remoteItems.length}) `;
		const remoteEmpty =
			state.availableProfiles.length === 0
				? "No profile configured. Press [P] to set up or create mock sandbox."
				: !state.statusOk
					? "Storage unreachable / credentials missing. Press [P] to switch profile or sandbox."
					: "Prefix is empty. Press [U] to upload.";
		rightText.content = formatPaneRows(
			state.remoteItems,
			state.remoteCursor,
			state.remoteScrollOffset,
			isRemoteActive,
			remoteEmpty,
			paneWidth,
			visibleRows,
		);
	};

	return { container, update };
}

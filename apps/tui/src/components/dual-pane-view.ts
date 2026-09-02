import { Formatter } from "@S3-vault-CLI/output";
import {
	BoxRenderable,
	bgBlue,
	bgGreen,
	bgMagenta,
	bgRed,
	bgYellow,
	black,
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
	white,
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

function getUploadStatusBadge(
	item: FileItem,
	expanded: boolean,
): TextChunk | string {
	const width = expanded ? 12 : 4;
	if (item.name === ".." || item.isDirectory) return " ".repeat(width);

	if (expanded) {
		switch (item.uploadStatus) {
			case "uploaded":
				return bgGreen(black(bold(" ✓ UPLOADED ")));
			case "changed":
				return bgYellow(black(bold(" ~ CHANGED  ")));
			case "renamed":
				return bgMagenta(white(bold(" ↪ RENAMED  ")));
			case "remote-missing":
				return bgRed(white(bold(" ! MISSING  ")));
			case "remote-changed":
				return bgRed(white(bold(" ! CONFLICT ")));
			case "checking":
				return bgBlue(white(bold(" … CHECKING ")));
			default:
				return " ".repeat(width);
		}
	}

	switch (item.uploadStatus) {
		case "uploaded":
			return bgGreen(black(bold(" ✓  ")));
		case "changed":
			return bgYellow(black(bold(" ~  ")));
		case "renamed":
			return bgMagenta(white(bold(" ↪  ")));
		case "remote-missing":
		case "remote-changed":
			return bgRed(white(bold(" !  ")));
		case "checking":
			return bgBlue(white(bold(" …  ")));
		default:
			return " ".repeat(width);
	}
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

export function getDualPaneLayout(termWidth: number, termHeight: number) {
	const singlePane = termWidth < 72;
	const paneWidth = singlePane
		? Math.max(18, termWidth - 6)
		: Math.max(24, Math.floor((termWidth - 7) / 2));

	return {
		singlePane,
		paneWidth,
		visibleRows: Math.max(1, termHeight - 14),
	};
}

export function formatPaneRows(
	items: FileItem[],
	cursor: number,
	scrollOffset: number,
	isActivePane: boolean,
	emptyMessage: string,
	paneWidth: number,
	visibleRows = 14,
	showUploadStatus = false,
): StyledText {
	if (items.length === 0) {
		return t`\n  ${dim(emptyMessage)}\n`;
	}

	const allChunks: TextChunk[] = [];
	const safeVisibleRows = Math.max(1, visibleRows);
	const maxOffset = Math.max(0, items.length - 1);
	let effectiveOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
	const itemCapacity = Math.max(1, safeVisibleRows - 2);
	if (cursor < effectiveOffset) effectiveOffset = cursor;
	if (cursor >= effectiveOffset + itemCapacity) {
		effectiveOffset = Math.max(0, cursor - itemCapacity + 1);
	}
	const showTopIndicator = effectiveOffset > 0 && safeVisibleRows >= 2;
	let availableItemRows = Math.max(
		1,
		safeVisibleRows - (showTopIndicator ? 1 : 0),
	);
	let end = Math.min(items.length, effectiveOffset + availableItemRows);
	const showBottomIndicator = end < items.length && availableItemRows >= 2;
	if (showBottomIndicator) {
		availableItemRows--;
		end = Math.min(items.length, effectiveOffset + availableItemRows);
	}

	const expandedStatus = showUploadStatus && paneWidth >= 44;
	const statusColWidth = showUploadStatus ? (expandedStatus ? 12 : 4) : 0;
	const showDate = paneWidth >= (showUploadStatus ? 68 : 46);
	const showSize = paneWidth >= (showUploadStatus ? 32 : 28);
	const dateColWidth = showDate ? 14 : 0;
	const sizeColWidth = showSize ? 10 : 0;
	// Layout: prefix + icon + name + optional size + prominent status badge + optional date.
	const fixedWidth =
		2 +
		2 +
		1 +
		2 +
		sizeColWidth +
		(showUploadStatus ? 1 + statusColWidth : 0) +
		(showDate ? 2 + dateColWidth : 0);
	const nameWidth = Math.max(4, paneWidth - fixedWidth - 4);

	// Top scroll indicator
	if (showTopIndicator) {
		const topIndicator = t`  ${yellow(`▲ (${effectiveOffset} more items above)`)}`;
		allChunks.push(...topIndicator.chunks, { __isChunk: true, text: "\n" });
	}

	for (let i = effectiveOffset; i < end; i++) {
		const item = items[i];
		if (!item) continue;

		const isSelected = i === cursor;
		const isParent = item.name === "..";
		const isDir = item.isDirectory;

		const statusBadge = showUploadStatus
			? getUploadStatusBadge(item, expandedStatus)
			: "";
		const icon = getFileIcon(item.name, isDir);
		const truncated = truncateFileName(item.name, nameWidth);
		const paddedName = truncated.padEnd(nameWidth, " ");

		const sizeText = isDir ? "<DIR>" : Formatter.formatBytes(item.size);
		const sizeStr = showSize ? sizeText.padStart(sizeColWidth, " ") : "";
		const dateStr =
			showDate && item.modifiedAt
				? (item.modifiedAt || "").padStart(dateColWidth, " ")
				: "";

		const badgeGap = showUploadStatus ? " " : "";
		let lineChunk: StyledText;
		if (isSelected && isActivePane) {
			const prefix = green(bold("❯ "));
			const nameChunk = cyan(bold(paddedName));
			const sizeChunk = isDir ? dim(sizeStr) : yellow(bold(sizeStr));
			const dateChunk = showDate ? dim(`  ${dateStr}`) : "";
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${badgeGap}${statusBadge}${dateChunk}`;
		} else if (isSelected && !isActivePane) {
			const prefix = dim("› ");
			const nameChunk = isDir || isParent ? blue(bold(paddedName)) : paddedName;
			const sizeChunk = isDir ? dim(sizeStr) : yellow(sizeStr);
			const dateChunk = showDate ? dim(`  ${dateStr}`) : "";
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${badgeGap}${statusBadge}${dateChunk}`;
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
			lineChunk = t`${prefix}${icon} ${nameChunk}  ${sizeChunk}${badgeGap}${statusBadge}${dateChunk}`;
		}

		allChunks.push(...lineChunk.chunks, { __isChunk: true, text: "\n" });
	}

	// Bottom scroll indicator
	const remaining = items.length - end;
	if (showBottomIndicator && remaining > 0) {
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
		overflow: "hidden",
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
		overflow: "hidden",
	});
	rightBox.add(rightText);

	const container = new BoxRenderable(renderer, {
		flexDirection: "row",
		flexGrow: 1,
		gap: 1,
		width: "100%",
		overflow: "hidden",
	});
	container.add(leftBox);
	container.add(rightBox);

	const update = (state: TuiState) => {
		const termWidth = process.stdout.columns || renderer.width || 80;
		const termHeight = process.stdout.rows || renderer.height || 24;
		const { singlePane, paneWidth, visibleRows } = getDualPaneLayout(
			termWidth,
			termHeight,
		);

		container.gap = singlePane ? 0 : 1;
		leftBox.width = singlePane ? "100%" : "50%";
		rightBox.width = singlePane ? "100%" : "50%";
		leftBox.visible = !singlePane || state.activePane === "local";
		rightBox.visible = !singlePane || state.activePane === "remote";

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
			true,
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

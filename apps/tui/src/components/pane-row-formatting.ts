import { Formatter } from "@S3-vault-CLI/output";
import {
	bgBlue,
	bgGreen,
	bgMagenta,
	bgRed,
	bgYellow,
	black,
	blue,
	bold,
	cyan,
	dim,
	green,
	StyledText,
	type TextChunk,
	t,
	white,
	yellow,
} from "@opentui/core";
import type { FileItem } from "../file-manager/types.js";

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
	const extension = name.includes(".")
		? name.toLowerCase().split(".").pop()
		: undefined;
	if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension || "")) {
		return "🎬";
	}
	if (
		["png", "jpg", "jpeg", "svg", "gif", "webp", "ico"].includes(
			extension || "",
		)
	) {
		return "🖼 ";
	}
	if (
		[
			"ts",
			"js",
			"tsx",
			"jsx",
			"json",
			"md",
			"txt",
			"html",
			"css",
			"yaml",
			"yml",
			"sh",
		].includes(extension || "")
	) {
		return "📝";
	}
	if (
		["zip", "tar", "gz", "7z", "rar", "dmg", "pkg"].includes(extension || "")
	) {
		return "📦";
	}
	return "📄";
}

function getWindow(
	items: FileItem[],
	cursor: number,
	offset: number,
	rows: number,
) {
	const safeRows = Math.max(1, rows);
	let start = Math.min(Math.max(0, offset), Math.max(0, items.length - 1));
	const capacity = Math.max(1, safeRows - 2);
	if (cursor < start) start = cursor;
	if (cursor >= start + capacity) start = Math.max(0, cursor - capacity + 1);
	const top = start > 0 && safeRows >= 2;
	let available = Math.max(1, safeRows - (top ? 1 : 0));
	let end = Math.min(items.length, start + available);
	const bottom = end < items.length && available >= 2;
	if (bottom) {
		available--;
		end = Math.min(items.length, start + available);
	}
	return { start, end, top, bottom };
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
	if (items.length === 0) return t`\n  ${dim(emptyMessage)}\n`;

	const chunks: TextChunk[] = [];
	const window = getWindow(items, cursor, scrollOffset, visibleRows);
	const expandedStatus = showUploadStatus && paneWidth >= 44;
	const statusWidth = showUploadStatus ? (expandedStatus ? 12 : 4) : 0;
	const showDate = paneWidth >= (showUploadStatus ? 68 : 46);
	const showSize = paneWidth >= (showUploadStatus ? 32 : 28);
	const dateWidth = showDate ? 14 : 0;
	const sizeWidth = showSize ? 10 : 0;
	const fixedWidth =
		7 +
		sizeWidth +
		(showUploadStatus ? 1 + statusWidth : 0) +
		(showDate ? 2 + dateWidth : 0);
	const nameWidth = Math.max(4, paneWidth - fixedWidth - 4);

	if (window.top) {
		const indicator = t`  ${yellow(`▲ (${window.start} more items above)`)}`;
		chunks.push(...indicator.chunks, { __isChunk: true, text: "\n" });
	}
	for (let index = window.start; index < window.end; index++) {
		const item = items[index];
		if (!item) continue;
		const selected = index === cursor;
		const isParent = item.name === "..";
		const isDirectory = item.isDirectory;
		const status = showUploadStatus
			? getUploadStatusBadge(item, expandedStatus)
			: "";
		const name = truncateFileName(item.name, nameWidth).padEnd(nameWidth, " ");
		const size = showSize
			? (isDirectory ? "<DIR>" : Formatter.formatBytes(item.size)).padStart(
					sizeWidth,
					" ",
				)
			: "";
		const date =
			showDate && item.modifiedAt
				? item.modifiedAt.padStart(dateWidth, " ")
				: "";
		const prefix = selected
			? isActivePane
				? green(bold("❯ "))
				: dim("› ")
			: "  ";
		const styledName =
			selected && isActivePane
				? cyan(bold(name))
				: isDirectory || isParent
					? blue(bold(name))
					: item.name.startsWith(".") && !selected
						? dim(name)
						: name;
		const styledSize = isDirectory
			? dim(size)
			: selected && isActivePane
				? yellow(bold(size))
				: yellow(size);
		const dateChunk = showDate ? dim(`  ${date}`) : "";
		const statusGap = showUploadStatus ? " " : "";
		const line = t`${prefix}${getFileIcon(item.name, isDirectory)} ${styledName}  ${styledSize}${statusGap}${status}${dateChunk}`;
		chunks.push(...line.chunks, { __isChunk: true, text: "\n" });
	}
	const remaining = items.length - window.end;
	if (window.bottom && remaining > 0) {
		const indicator = t`  ${yellow(`▼ (${remaining} more items below)`)}`;
		chunks.push(...indicator.chunks, { __isChunk: true, text: "\n" });
	}
	const rendered = chunks.filter((chunk) => chunk.text === "\n").length;
	for (let row = rendered; row < visibleRows; row++) {
		chunks.push({ __isChunk: true, text: "\n" });
	}
	return new StyledText(chunks);
}

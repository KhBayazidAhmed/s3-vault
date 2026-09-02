import { Formatter } from "@S3-vault-CLI/output";
import {
	BoxRenderable,
	blue,
	bold,
	type CliRenderer,
	cyan,
	dim,
	green,
	red,
	StyledText,
	type TextChunk,
	TextRenderable,
	t,
	yellow,
} from "@opentui/core";
import type { TuiState } from "../file-manager/types.js";

function truncateEnd(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	if (maxLength <= 3) return value.slice(0, maxLength);
	return `${value.slice(0, maxLength - 3)}...`;
}

export function renderProgressBar(percentage: number, width = 16): string {
	const safePercentage = Math.max(0, Math.min(100, Math.round(percentage)));
	const safeWidth = Math.max(1, width);
	const filled = Math.round((safePercentage / 100) * safeWidth);
	const empty = Math.max(0, safeWidth - filled);
	return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${safePercentage}%`;
}

export function createHeaderView(renderer: CliRenderer) {
	const headerText = new TextRenderable(renderer, { content: "" });

	const container = new BoxRenderable(renderer, {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		border: true,
		borderStyle: "rounded",
		borderColor: "#3b82f6",
		title: " ⚡ S3 VAULT v0.1.0 ",
		titleAlignment: "left",
		paddingX: 1,
		marginBottom: 1,
		width: "100%",
	});
	container.add(headerText);

	const update = (state: TuiState) => {
		const termWidth = process.stdout.columns || renderer.width || 80;
		let healthBadge: TextChunk;
		if (state.provider === "mock") {
			healthBadge = green(bold("🟢 Sandbox Active (0ms)"));
		} else if (state.statusOk) {
			healthBadge = green(bold(`🟢 Connected (${state.latencyMs}ms)`));
		} else if (!state.activeProfileName) {
			healthBadge = yellow(bold("⚠️ No Profile Configured"));
		} else {
			healthBadge = red(bold("🔴 Offline / No Credentials"));
		}

		const profileName = state.activeProfileName
			? cyan(bold(state.activeProfileName))
			: yellow("⚠️ No Profile [Press P]");
		const providerText = state.activeProfileName
			? dim(`(${state.provider || "mock"})`)
			: "";
		const bucketText = state.activeBucket ? blue(bold(state.activeBucket)) : "";
		const bucketPrefix = state.activeBucket ? "  •  Bucket: " : "";

		if (termWidth < 72) {
			const compactStatus = state.statusOk
				? green(bold("● Online"))
				: yellow(bold("● Offline"));
			const compactProfile = state.activeProfileName
				? cyan(
						bold(
							truncateEnd(state.activeProfileName, Math.max(8, termWidth - 24)),
						),
					)
				: yellow("No Profile");
			headerText.content = t`🔐 ${compactProfile}  ${compactStatus}`;
		} else {
			headerText.content = t`🔐 Profile: ${profileName} ${providerText}  •  Status: ${healthBadge}${bucketPrefix}${bucketText}`;
		}
	};

	return { container, update };
}

export function createBottomBarView(renderer: CliRenderer) {
	const footerText = new TextRenderable(renderer, { content: "" });

	const container = new BoxRenderable(renderer, {
		flexDirection: "column",
		border: true,
		borderStyle: "rounded",
		borderColor: "#555555",
		title: " ⌨️ STATUS & KEYBOARD SHORTCUTS ",
		titleAlignment: "left",
		paddingX: 1,
		marginTop: 1,
		width: "100%",
	});
	container.add(footerText);

	const update = (state: TuiState) => {
		const termWidth = process.stdout.columns || renderer.width || 80;
		const contentWidth = Math.max(20, termWidth - 6);
		const chunks: TextChunk[] = [];

		// Row 1: Live Status or Progress
		if (state.progress.active) {
			const bytes = `${Formatter.formatBytes(state.progress.transferredBytes)} / ${Formatter.formatBytes(state.progress.totalBytes)}`;
			const barWidth = termWidth < 72 ? 8 : termWidth < 100 ? 12 : 16;
			const showBytes = termWidth >= 50;
			const byteSummary = showBytes ? ` (${bytes})` : "";
			const reservedWidth = barWidth + byteSummary.length + 11;
			const label = truncateEnd(
				state.progress.label,
				Math.max(4, contentWidth - reservedWidth),
			);
			const bar = renderProgressBar(state.progress.percentage, barWidth);
			const progressChunk = t`⚡ ${cyan(bold(label))} ${bar}${byteSummary}`;
			chunks.push(...progressChunk.chunks);
		} else if (state.statusType === "success") {
			const statusChunk = t`${green(bold("✔"))} ${truncateEnd(state.statusMessage, contentWidth - 2)}`;
			chunks.push(...statusChunk.chunks);
		} else if (state.statusType === "error") {
			const statusChunk = t`${red(bold("✖"))} ${truncateEnd(state.statusMessage, contentWidth - 2)}`;
			chunks.push(...statusChunk.chunks);
		} else if (state.statusType === "warning") {
			const statusChunk = t`${yellow(bold("⚠"))} ${truncateEnd(state.statusMessage, contentWidth - 2)}`;
			chunks.push(...statusChunk.chunks);
		} else {
			const statusChunk = t`${cyan("ℹ")} ${truncateEnd(state.statusMessage, contentWidth - 2)}`;
			chunks.push(...statusChunk.chunks);
		}

		chunks.push({ __isChunk: true, text: "\n" });

		// Row 2 & 3: Shortcuts
		const row1 =
			termWidth < 50
				? t`${cyan("[Tab]")} Pane  ${cyan("[↑/↓]")} Move  ${cyan("[Enter]")} Open`
				: termWidth < 72
					? t`${cyan("[Tab]")} Pane  ${cyan("[↑/↓]")} Move  ${cyan("[Enter]")} Open  ${cyan("[U]")} Up  ${cyan("[D]")} Down`
					: termWidth < 120
						? t`${cyan("[Tab]")} Switch  ${cyan("[↑/↓]")} Move  ${cyan("[Enter]")} Open  ${cyan("[Bksp]")} Up  ${cyan("[U]")} Upload  ${cyan("[D]")} Download`
						: t`${cyan("[Tab]")} Switch   ${cyan("[↑/↓, j/k]")} Move   ${cyan("[Enter, l]")} Open   ${cyan("[Bksp, h]")} Up Dir   ${cyan("[U]")} Upload   ${cyan("[D]")} Download`;
		const row2 =
			termWidth < 50
				? t`${cyan("[U]")} Upload  ${cyan("[D]")} Download  ${cyan("[P]")} Profiles  ${cyan("[Q]")} Quit`
				: termWidth < 72
					? t`${cyan("[S]")} Share  ${cyan("[X]")} Delete  ${cyan("[P]")} Profiles  ${cyan("[R]")} Refresh  ${cyan("[Q]")} Quit`
					: termWidth < 120
						? t`${cyan("[S]")} Share  ${cyan("[Del]")} Delete  ${cyan("[P]")} Profiles  ${cyan("[R]")} Refresh  ${cyan("[Home/End]")} Jump  ${cyan("[Q]")} Quit`
						: t`${cyan("[S]")} Share Link   ${cyan("[Del, x]")} Delete   ${cyan("[P]")} Profiles   ${cyan("[R]")} Refresh   ${cyan("[Home/End, g/G]")} Jump   ${cyan("[Q]")} Quit`;

		chunks.push(...row1.chunks);
		chunks.push({ __isChunk: true, text: "\n" });
		chunks.push(...row2.chunks);

		footerText.content = new StyledText(chunks);
	};

	return { container, update };
}

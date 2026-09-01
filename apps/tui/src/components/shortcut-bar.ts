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

function renderProgressBar(percentage: number, width = 16): string {
	const filled = Math.round((percentage / 100) * width);
	const empty = Math.max(0, width - filled);
	return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percentage}%`;
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

		headerText.content = t`🔐 Profile: ${profileName} ${providerText}  •  Status: ${healthBadge}${bucketPrefix}${bucketText}`;
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
		const chunks: TextChunk[] = [];

		// Row 1: Live Status or Progress
		if (state.progress.active) {
			const bar = renderProgressBar(state.progress.percentage);
			const bytes = `${Formatter.formatBytes(state.progress.transferredBytes)} / ${Formatter.formatBytes(state.progress.totalBytes)}`;
			const progressChunk = t`⚡ ${cyan(bold(state.progress.label))} ${bar} (${bytes})`;
			chunks.push(...progressChunk.chunks);
		} else if (state.statusType === "success") {
			const statusChunk = t`${green(bold("✔"))} ${state.statusMessage}`;
			chunks.push(...statusChunk.chunks);
		} else if (state.statusType === "error") {
			const statusChunk = t`${red(bold("✖"))} ${state.statusMessage}`;
			chunks.push(...statusChunk.chunks);
		} else if (state.statusType === "warning") {
			const statusChunk = t`${yellow(bold("⚠"))} ${state.statusMessage}`;
			chunks.push(...statusChunk.chunks);
		} else {
			const statusChunk = t`${cyan("ℹ")} ${state.statusMessage}`;
			chunks.push(...statusChunk.chunks);
		}

		chunks.push({ __isChunk: true, text: "\n" });

		// Row 2 & 3: Shortcuts
		const row1 = t`${cyan("[Tab]")} Switch   ${cyan("[↑/↓, j/k]")} Move   ${cyan("[Enter, l]")} Open   ${cyan("[Bksp, h]")} Up Dir   ${cyan("[U]")} Upload   ${cyan("[D]")} Download`;
		const row2 = t`${cyan("[S]")} Share Link   ${cyan("[Del, x]")} Delete   ${cyan("[P]")} Profiles   ${cyan("[R]")} Refresh   ${cyan("[Home/End, g/G]")} Jump   ${cyan("[Q]")} Quit`;

		chunks.push(...row1.chunks);
		chunks.push({ __isChunk: true, text: "\n" });
		chunks.push(...row2.chunks);

		footerText.content = new StyledText(chunks);
	};

	return { container, update };
}

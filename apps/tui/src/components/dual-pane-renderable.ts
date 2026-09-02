import {
	BoxRenderable,
	bold,
	type CliRenderer,
	cyan,
	RGBA,
	TextRenderable,
	t,
} from "@opentui/core";
import type { FileItem, PaneType, TuiState } from "../file-manager/types.js";
import { formatPaneRows } from "./pane-row-formatting.js";

function truncateMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const half = Math.max(2, Math.floor((maxLength - 3) / 2));
	return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}

function getFilteredItems(state: TuiState, pane: PaneType): FileItem[] {
	const items = pane === "local" ? state.localItems : state.remoteItems;
	if (state.searchPane !== pane || !state.searchQuery) return items;
	const query = state.searchQuery.toLocaleLowerCase();
	return items.filter((item) => item.name.toLocaleLowerCase().includes(query));
}

function createPaneBox(
	renderer: CliRenderer,
	title: string,
	borderColor: string,
) {
	const searchText = new TextRenderable(renderer, { content: "" });
	const rowsText = new TextRenderable(renderer, { content: "" });
	const box = new BoxRenderable(renderer, {
		flexDirection: "column",
		flexGrow: 1,
		width: "50%",
		border: true,
		borderStyle: "rounded",
		borderColor,
		title,
		titleAlignment: "left",
		paddingX: 1,
		overflow: "hidden",
	});
	box.add(searchText);
	box.add(rowsText);
	return { box, searchText, rowsText };
}

export function createDualPaneRenderable(
	renderer: CliRenderer,
	getLayout: (
		width: number,
		height: number,
	) => {
		singlePane: boolean;
		paneWidth: number;
		visibleRows: number;
	},
) {
	const left = createPaneBox(renderer, " 📂 LOCAL ", "#00e5ff");
	const right = createPaneBox(renderer, " ☁️ REMOTE ", "#444444");
	const container = new BoxRenderable(renderer, {
		flexDirection: "row",
		flexGrow: 1,
		gap: 1,
		width: "100%",
		overflow: "hidden",
	});
	container.add(left.box);
	container.add(right.box);

	const update = (state: TuiState) => {
		const termWidth = process.stdout.columns || renderer.width || 80;
		const termHeight = process.stdout.rows || renderer.height || 24;
		const { singlePane, paneWidth, visibleRows } = getLayout(
			termWidth,
			termHeight,
		);
		container.gap = singlePane ? 0 : 1;
		left.box.width = singlePane ? "100%" : "50%";
		right.box.width = singlePane ? "100%" : "50%";
		left.box.visible = !singlePane || state.activePane === "local";
		right.box.visible = !singlePane || state.activePane === "remote";

		const localItems = getFilteredItems(state, "local");
		const remoteItems = getFilteredItems(state, "remote");
		const showLocalSearch =
			state.searchPane === "local" &&
			(state.searchActive || !!state.searchQuery);
		const showRemoteSearch =
			state.searchPane === "remote" &&
			(state.searchActive || !!state.searchQuery);
		const searchCursor = state.searchActive ? "█" : "";
		const searchHint = state.searchQuery || "type to filter…";
		left.searchText.visible = showLocalSearch;
		right.searchText.visible = showRemoteSearch;
		left.searchText.content = t`${cyan(bold("🔎 Search:"))} ${searchHint}${searchCursor}`;
		right.searchText.content = t`${cyan(bold("🔎 Search:"))} ${searchHint}${searchCursor}`;

		const localActive = state.activePane === "local";
		left.box.borderColor = RGBA.fromHex(localActive ? "#00e5ff" : "#444444");
		const localCount = showLocalSearch
			? `${localItems.length}/${state.localItems.length}`
			: `${state.localItems.length}`;
		left.box.title = ` 📂 LOCAL: ${truncateMiddle(state.localPath, Math.max(10, paneWidth - 16))} (${localCount}) `;
		left.rowsText.content = formatPaneRows(
			localItems,
			state.localCursor,
			state.localScrollOffset,
			localActive,
			state.searchQuery && state.searchPane === "local"
				? "No files match your search."
				: "Folder is empty.",
			paneWidth,
			Math.max(1, visibleRows - (showLocalSearch ? 1 : 0)),
			true,
		);

		const remoteActive = state.activePane === "remote";
		const remotePath = state.activeBucket
			? `s3://${state.activeBucket}/${state.remotePrefix}`
			: "No Profile";
		right.box.borderColor = RGBA.fromHex(remoteActive ? "#00e5ff" : "#444444");
		const remoteCount = showRemoteSearch
			? `${remoteItems.length}/${state.remoteItems.length}`
			: `${state.remoteItems.length}`;
		right.box.title = ` ☁️ REMOTE: ${truncateMiddle(remotePath, Math.max(10, paneWidth - 16))} (${remoteCount}) `;
		const remoteEmpty =
			state.availableProfiles.length === 0
				? "No profile configured. Press [P] to set up or create mock sandbox."
				: !state.statusOk
					? "Storage unreachable / credentials missing. Press [P] to switch profile or sandbox."
					: "Prefix is empty. Press [U] to upload.";
		right.rowsText.content = formatPaneRows(
			remoteItems,
			state.remoteCursor,
			state.remoteScrollOffset,
			remoteActive,
			state.searchQuery && state.searchPane === "remote"
				? "No objects match your search."
				: remoteEmpty,
			paneWidth,
			Math.max(1, visibleRows - (showRemoteSearch ? 1 : 0)),
		);
	};

	return { container, update };
}

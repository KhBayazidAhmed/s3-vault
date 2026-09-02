import type { FileItem, PaneType, TuiState } from "./types.js";

export function getItemsForPane(
	state: TuiState,
	pane: PaneType = state.activePane,
): FileItem[] {
	const items = pane === "local" ? state.localItems : state.remoteItems;
	if (state.searchPane !== pane || !state.searchQuery) return items;

	const query = state.searchQuery.toLocaleLowerCase();
	return items.filter((item) => item.name.toLocaleLowerCase().includes(query));
}

export function resetActiveCursor(state: TuiState) {
	if (state.activePane === "local") {
		state.localCursor = 0;
		state.localScrollOffset = 0;
	} else {
		state.remoteCursor = 0;
		state.remoteScrollOffset = 0;
	}
}

export function clearSearchForPane(state: TuiState, pane: PaneType) {
	if (state.searchPane === pane) {
		state.searchQuery = "";
		state.searchActive = false;
	}
}

function updatePaneCursor(
	state: TuiState,
	pane: PaneType,
	delta: number,
	maxVisibleRows: number,
): boolean {
	const total = getItemsForPane(state, pane).length;
	if (total === 0) return false;

	const cursorKey = pane === "local" ? "localCursor" : "remoteCursor";
	const offsetKey =
		pane === "local" ? "localScrollOffset" : "remoteScrollOffset";
	const next = Math.max(0, Math.min(total - 1, state[cursorKey] + delta));
	state[cursorKey] = next;
	if (next < state[offsetKey]) {
		state[offsetKey] = next;
	} else if (next >= state[offsetKey] + maxVisibleRows) {
		state[offsetKey] = next - maxVisibleRows + 1;
	}
	return true;
}

export function moveCursor(
	state: TuiState,
	delta: number,
	maxVisibleRows: number,
): boolean {
	if (state.activeModal !== "none") {
		const max = (state.modalData?.optionsCount || 1) - 1;
		state.modalCursor = Math.max(0, Math.min(max, state.modalCursor + delta));
		return true;
	}
	return updatePaneCursor(state, state.activePane, delta, maxVisibleRows);
}

export function jumpToTop(state: TuiState) {
	if (state.activePane === "local") {
		state.localCursor = 0;
		state.localScrollOffset = 0;
	} else {
		state.remoteCursor = 0;
		state.remoteScrollOffset = 0;
	}
}

export function jumpToBottom(state: TuiState, maxVisibleRows: number) {
	const pane = state.activePane;
	const total = getItemsForPane(state, pane).length;
	if (total === 0) return;

	if (pane === "local") {
		state.localCursor = total - 1;
		state.localScrollOffset = Math.max(0, total - maxVisibleRows);
	} else {
		state.remoteCursor = total - 1;
		state.remoteScrollOffset = Math.max(0, total - maxVisibleRows);
	}
}

export function getSelectedItem(
	state: TuiState,
	pane: PaneType = state.activePane,
): FileItem | undefined {
	const cursor = pane === "local" ? state.localCursor : state.remoteCursor;
	return getItemsForPane(state, pane)[cursor];
}

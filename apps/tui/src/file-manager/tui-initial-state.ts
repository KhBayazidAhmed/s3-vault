import type { TuiState } from "./types.js";

export function createInitialTuiState(initialPath: string): TuiState {
	return {
		activePane: "local",
		searchQuery: "",
		searchPane: "local",
		searchActive: false,
		localPath: initialPath,
		localItems: [],
		localCursor: 0,
		localScrollOffset: 0,
		remotePrefix: "",
		remoteItems: [],
		remoteCursor: 0,
		remoteScrollOffset: 0,
		statusOk: false,
		latencyMs: 0,
		availableProfiles: [],
		activeModal: "none",
		modalCursor: 0,
		modalInput: "",
		modalStep: 0,
		modalData: {},
		statusMessage:
			"Welcome to S3 Vault! Use Tab to switch panes, Arrow keys to navigate.",
		statusType: "info",
		progress: {
			active: false,
			label: "",
			transferredBytes: 0,
			totalBytes: 0,
			percentage: 0,
		},
		isLoading: false,
	};
}

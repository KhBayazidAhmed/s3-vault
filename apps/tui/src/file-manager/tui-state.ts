import type { ServiceContext } from "@S3-vault-CLI/application";
import { createInitialTuiState } from "./tui-initial-state.js";
import { TuiStateData } from "./tui-state-data.js";
import {
	clearSearchForPane,
	getItemsForPane,
	getSelectedItem,
	jumpToBottom,
	jumpToTop,
	moveCursor,
	resetActiveCursor,
} from "./tui-state-navigation.js";
import type {
	FileItem,
	ModalType,
	PaneType,
	TransferProgressState,
	TuiState,
} from "./types.js";

export class TuiStateManager {
	private state: TuiState;
	private onChangeListeners: (() => void)[] = [];
	private data: TuiStateData;

	constructor(initialPath: string = process.cwd()) {
		this.state = createInitialTuiState(initialPath);
		this.data = new TuiStateData(this.state, () => this.notify());
	}

	getState(): Readonly<TuiState> {
		return this.state;
	}

	subscribe(listener: () => void): () => void {
		this.onChangeListeners.push(listener);
		return () => {
			this.onChangeListeners = this.onChangeListeners.filter(
				(candidate) => candidate !== listener,
			);
		};
	}

	private notify() {
		for (const listener of this.onChangeListeners) listener();
	}

	togglePane() {
		this.state.activePane =
			this.state.activePane === "local" ? "remote" : "local";
		this.state.searchActive = false;
		this.notify();
	}

	getItemsForPane(pane: PaneType = this.state.activePane): FileItem[] {
		return getItemsForPane(this.state, pane);
	}

	startSearch(initialQuery = "") {
		this.state.searchPane = this.state.activePane;
		this.state.searchQuery = initialQuery;
		this.state.searchActive = true;
		resetActiveCursor(this.state);
		this.notify();
	}

	appendSearch(text: string) {
		if (!this.state.searchActive || !text) return;
		this.state.searchQuery += text;
		resetActiveCursor(this.state);
		this.notify();
	}

	deleteSearchCharacter() {
		if (!this.state.searchActive) return;
		this.state.searchQuery = this.state.searchQuery.slice(0, -1);
		resetActiveCursor(this.state);
		this.notify();
	}

	finishSearch() {
		if (!this.state.searchActive) return;
		this.state.searchActive = false;
		this.notify();
	}

	clearSearch() {
		this.state.searchQuery = "";
		this.state.searchActive = false;
		resetActiveCursor(this.state);
		this.notify();
	}

	moveCursor(delta: number, maxVisibleRows = 12) {
		if (moveCursor(this.state, delta, maxVisibleRows)) this.notify();
	}

	jumpToTop() {
		jumpToTop(this.state);
		this.notify();
	}

	jumpToBottom(maxVisibleRows = 14) {
		jumpToBottom(this.state, maxVisibleRows);
		this.notify();
	}

	getSelectedItem(
		pane: PaneType = this.state.activePane,
	): FileItem | undefined {
		return getSelectedItem(this.state, pane);
	}

	refreshLocal() {
		this.data.refreshLocal();
	}

	setLocalPath(newPath: string) {
		clearSearchForPane(this.state, "local");
		this.state.localPath = newPath;
		this.state.localCursor = 0;
		this.state.localScrollOffset = 0;
		this.refreshLocal();
	}

	navigateUp(context?: ServiceContext) {
		if (this.state.activePane === "local") {
			const parent = this.state.localItems.find((item) => item.name === "..");
			if (parent) {
				this.setLocalPath(parent.path);
				this.setStatus(`Browsing local: ${parent.path}`, "info");
			}
		} else if (context) {
			const parent = this.state.remoteItems.find((item) => item.name === "..");
			if (parent) {
				this.setRemotePrefix(parent.path, context);
				this.setStatus(
					`Browsing remote prefix: ${parent.path || "(root)"}`,
					"info",
				);
			}
		}
	}

	async refreshRemote(context: ServiceContext) {
		await this.data.refreshRemote(context);
	}

	setRemotePrefix(prefix: string, context: ServiceContext) {
		clearSearchForPane(this.state, "remote");
		this.state.remotePrefix = prefix;
		this.state.remoteCursor = 0;
		this.state.remoteScrollOffset = 0;
		this.refreshRemote(context);
	}

	setStatus(
		message: string,
		type: "info" | "success" | "error" | "warning" = "info",
	) {
		this.state.statusMessage = message;
		this.state.statusType = type;
		this.notify();
	}

	setProgress(progress: Partial<TransferProgressState>) {
		const next = { ...this.state.progress, ...progress };
		const transferredBytes = Math.max(0, next.transferredBytes);
		const totalBytes = Math.max(0, next.totalBytes);
		this.state.progress = {
			...next,
			transferredBytes,
			totalBytes,
			percentage:
				totalBytes > 0
					? Math.round(
							(Math.min(transferredBytes, totalBytes) / totalBytes) * 100,
						)
					: 0,
		};
		this.notify();
	}

	clearProgress() {
		this.state.progress = {
			active: false,
			label: "",
			transferredBytes: 0,
			totalBytes: 0,
			percentage: 0,
		};
		this.notify();
	}

	setLoading(isLoading: boolean) {
		this.state.isLoading = isLoading;
		this.notify();
	}

	openModal(modal: ModalType, data: Record<string, any> = {}) {
		this.state.activeModal = modal;
		this.state.modalCursor = 0;
		this.state.modalInput = "";
		this.state.modalStep = 0;
		this.state.modalData = data;
		this.notify();
	}

	closeModal() {
		this.state.activeModal = "none";
		this.state.modalCursor = 0;
		this.state.modalInput = "";
		this.state.modalStep = 0;
		this.state.modalData = {};
		this.notify();
	}
}

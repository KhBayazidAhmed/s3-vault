import type { ServiceContext } from "@S3-vault-CLI/application";
import { LocalBrowser } from "./local-browser.js";
import { RemoteBrowser } from "./remote-browser.js";
import type {
	FileItem,
	ModalType,
	TransferProgressState,
	TuiState,
} from "./types.js";

export class TuiStateManager {
	private state: TuiState;
	private onChangeListeners: (() => void)[] = [];

	constructor(initialPath: string = process.cwd()) {
		this.state = {
			activePane: "local",
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

	getState(): Readonly<TuiState> {
		return this.state;
	}

	subscribe(listener: () => void): () => void {
		this.onChangeListeners.push(listener);
		return () => {
			this.onChangeListeners = this.onChangeListeners.filter(
				(l) => l !== listener,
			);
		};
	}

	private notify() {
		for (const listener of this.onChangeListeners) {
			listener();
		}
	}

	togglePane() {
		this.state.activePane =
			this.state.activePane === "local" ? "remote" : "local";
		this.notify();
	}

	moveCursor(delta: number, maxVisibleRows = 12) {
		if (this.state.activeModal !== "none") {
			// Modal navigation
			const max = (this.state.modalData?.optionsCount || 1) - 1;
			this.state.modalCursor = Math.max(
				0,
				Math.min(max, this.state.modalCursor + delta),
			);
			this.notify();
			return;
		}

		if (this.state.activePane === "local") {
			const total = this.state.localItems.length;
			if (total === 0) return;
			const next = Math.max(
				0,
				Math.min(total - 1, this.state.localCursor + delta),
			);
			this.state.localCursor = next;

			// Adjust scroll window
			if (next < this.state.localScrollOffset) {
				this.state.localScrollOffset = next;
			} else if (next >= this.state.localScrollOffset + maxVisibleRows) {
				this.state.localScrollOffset = next - maxVisibleRows + 1;
			}
		} else {
			const total = this.state.remoteItems.length;
			if (total === 0) return;
			const next = Math.max(
				0,
				Math.min(total - 1, this.state.remoteCursor + delta),
			);
			this.state.remoteCursor = next;

			// Adjust scroll window
			if (next < this.state.remoteScrollOffset) {
				this.state.remoteScrollOffset = next;
			} else if (next >= this.state.remoteScrollOffset + maxVisibleRows) {
				this.state.remoteScrollOffset = next - maxVisibleRows + 1;
			}
		}
		this.notify();
	}

	jumpToTop() {
		if (this.state.activePane === "local") {
			this.state.localCursor = 0;
			this.state.localScrollOffset = 0;
		} else {
			this.state.remoteCursor = 0;
			this.state.remoteScrollOffset = 0;
		}
		this.notify();
	}

	jumpToBottom(maxVisibleRows = 14) {
		if (this.state.activePane === "local") {
			const total = this.state.localItems.length;
			if (total > 0) {
				this.state.localCursor = total - 1;
				this.state.localScrollOffset = Math.max(0, total - maxVisibleRows);
			}
		} else {
			const total = this.state.remoteItems.length;
			if (total > 0) {
				this.state.remoteCursor = total - 1;
				this.state.remoteScrollOffset = Math.max(0, total - maxVisibleRows);
			}
		}
		this.notify();
	}

	getSelectedItem(): FileItem | undefined {
		if (this.state.activePane === "local") {
			return this.state.localItems[this.state.localCursor];
		}
		return this.state.remoteItems[this.state.remoteCursor];
	}

	refreshLocal() {
		this.state.localItems = LocalBrowser.readDirectory(this.state.localPath);
		if (this.state.localCursor >= this.state.localItems.length) {
			this.state.localCursor = Math.max(0, this.state.localItems.length - 1);
		}
		this.notify();
	}

	setLocalPath(newPath: string) {
		this.state.localPath = newPath;
		this.state.localCursor = 0;
		this.state.localScrollOffset = 0;
		this.refreshLocal();
	}

	navigateUp(context?: ServiceContext) {
		if (this.state.activePane === "local") {
			const parentItem = this.state.localItems.find((i) => i.name === "..");
			if (parentItem) {
				this.setLocalPath(parentItem.path);
				this.setStatus(`Browsing local: ${parentItem.path}`, "info");
			}
		} else if (context) {
			const parentItem = this.state.remoteItems.find((i) => i.name === "..");
			if (parentItem) {
				this.setRemotePrefix(parentItem.path, context);
				this.setStatus(
					`Browsing remote prefix: ${parentItem.path || "(root)"}`,
					"info",
				);
			}
		}
	}

	async refreshRemote(context: ServiceContext) {
		const profiles = context.configManager.listProfiles();
		this.state.availableProfiles = profiles.map((p) => ({
			name: p.name,
			provider: p.profile.provider,
			bucket: p.profile.bucket,
			region: p.profile.region,
			isActive: p.isActive,
			isDefault: p.isDefault,
		}));

		if (profiles.length === 0) {
			this.state.remoteItems = [];
			this.state.activeProfileName = undefined;
			this.state.activeBucket = undefined;
			this.state.statusOk = false;
			this.notify();
			return;
		}

		try {
			const { runtimeConfig, storage } =
				await context.resolveStorageWithCredentials();
			this.state.activeProfileName = runtimeConfig.profileName;
			this.state.activeBucket = runtimeConfig.bucket;
			this.state.provider = runtimeConfig.provider;

			// Check health
			const health = await storage.checkHealth(runtimeConfig.bucket);
			this.state.statusOk = health.ok;
			this.state.latencyMs = health.latencyMs;

			// Load items
			const { ListObjectsUseCase } = await import("@S3-vault-CLI/application");
			const listUseCase = new ListObjectsUseCase(context);
			this.state.remoteItems = await RemoteBrowser.listPrefix(
				listUseCase,
				this.state.remotePrefix,
			);

			if (this.state.remoteCursor >= this.state.remoteItems.length) {
				this.state.remoteCursor = Math.max(
					0,
					this.state.remoteItems.length - 1,
				);
			}
		} catch (err: unknown) {
			this.state.statusOk = false;
			this.state.remoteItems = [];
		}
		this.notify();
	}

	setRemotePrefix(prefix: string, context: ServiceContext) {
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
		this.state.progress = {
			...this.state.progress,
			...progress,
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

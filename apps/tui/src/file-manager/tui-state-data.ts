import {
	LocalUploadStatusUseCase,
	type ServiceContext,
} from "@S3-vault-CLI/application";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { LocalBrowser } from "./local-browser.js";
import { RemoteBrowser } from "./remote-browser.js";
import { getItemsForPane } from "./tui-state-navigation.js";
import type { TuiState } from "./types.js";

type UploadStatuses = ReturnType<LocalUploadStatusUseCase["execute"]>;

export class TuiStateData {
	private context?: ServiceContext;

	constructor(
		private readonly state: TuiState,
		private readonly notify: () => void,
	) {}

	refreshLocal() {
		this.state.localItems = LocalBrowser.readDirectory(this.state.localPath);
		if (
			this.context &&
			this.state.activeProfileName &&
			this.state.activeBucket
		) {
			const statuses = new LocalUploadStatusUseCase(this.context).execute({
				profileName: this.state.activeProfileName,
				bucket: this.state.activeBucket,
				files: this.state.localItems,
			});
			this.applyLocalUploadStatuses(statuses);
		}
		this.normalizeLocalCursor();
		this.notify();
	}

	private async refreshLocalWithRemoteVerification(storage: StorageBackend) {
		this.state.localItems = LocalBrowser.readDirectory(this.state.localPath);
		if (
			this.context &&
			this.state.activeProfileName &&
			this.state.activeBucket
		) {
			const statuses = await new LocalUploadStatusUseCase(
				this.context,
			).executeWithRemoteVerification(
				{
					profileName: this.state.activeProfileName,
					bucket: this.state.activeBucket,
					files: this.state.localItems,
				},
				storage,
			);
			this.applyLocalUploadStatuses(statuses);
		}
		this.normalizeLocalCursor();
		this.notify();
	}

	private applyLocalUploadStatuses(statuses: UploadStatuses) {
		this.state.localItems = this.state.localItems.map((item) => {
			const result = statuses.get(item.path);
			return result
				? {
						...item,
						uploadStatus: result.status,
						uploadedDestination: result.destination,
					}
				: item;
		});
	}

	private normalizeLocalCursor() {
		const total = getItemsForPane(this.state, "local").length;
		if (this.state.localCursor >= total) {
			this.state.localCursor = Math.max(0, total - 1);
		}
	}

	async refreshRemote(context: ServiceContext) {
		this.context = context;
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
			this.refreshLocal();
			return;
		}

		try {
			const { runtimeConfig, storage } =
				await context.resolveStorageWithCredentials();
			this.state.activeProfileName = runtimeConfig.profileName;
			this.state.activeBucket = runtimeConfig.bucket;
			this.state.provider = runtimeConfig.provider;

			const health = await storage.checkHealth(runtimeConfig.bucket);
			this.state.statusOk = health.ok;
			this.state.latencyMs = health.latencyMs;

			const { ListObjectsUseCase } = await import("@S3-vault-CLI/application");
			const listUseCase = new ListObjectsUseCase(context);
			this.state.remoteItems = await RemoteBrowser.listPrefix(
				listUseCase,
				this.state.remotePrefix,
			);
			const remoteTotal = getItemsForPane(this.state, "remote").length;
			if (this.state.remoteCursor >= remoteTotal) {
				this.state.remoteCursor = Math.max(0, remoteTotal - 1);
			}
			await this.refreshLocalWithRemoteVerification(storage);
			return;
		} catch {
			this.state.statusOk = false;
			this.state.remoteItems = [];
		}
		this.refreshLocal();
	}
}

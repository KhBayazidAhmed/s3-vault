import {
	type CliConfigOverrides,
	ConfigManager,
	ConfigResolver,
	type ResolvedRuntimeConfig,
} from "@S3-vault-CLI/config";
import {
	MultiTierSecretResolver,
	type SecretCredentials,
} from "@S3-vault-CLI/secrets";
import {
	DatabaseManager,
	LockManager,
	MultipartRepository,
	ObjectCacheManager,
	SnapshotRepository,
	TransferRepository,
	UploadedFileRepository,
} from "@S3-vault-CLI/state";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { BackendFactory } from "./backend-factory.js";

export class ServiceContext {
	private _configManager?: ConfigManager;
	private _secretResolver?: MultiTierSecretResolver;
	private _dbManager?: DatabaseManager;
	private _transferRepo?: TransferRepository;
	private _multipartRepo?: MultipartRepository;
	private _lockManager?: LockManager;
	private _cacheManager?: ObjectCacheManager;
	private _snapshotRepo?: SnapshotRepository;
	private _uploadedFileRepo?: UploadedFileRepository;

	constructor(
		private readonly options: {
			customConfigPath?: string;
			customDbPath?: string;
			customSnapshotsDir?: string;
		} = {},
	) {}

	get configManager(): ConfigManager {
		if (!this._configManager) {
			this._configManager = new ConfigManager(this.options.customConfigPath);
		}
		return this._configManager;
	}

	get secretResolver(): MultiTierSecretResolver {
		if (!this._secretResolver) {
			this._secretResolver = new MultiTierSecretResolver();
		}
		return this._secretResolver;
	}

	get dbManager(): DatabaseManager {
		if (!this._dbManager) {
			this._dbManager = new DatabaseManager(this.options.customDbPath);
		}
		return this._dbManager;
	}

	get transferRepo(): TransferRepository {
		if (!this._transferRepo) {
			this._transferRepo = new TransferRepository(this.dbManager.rawDb);
		}
		return this._transferRepo;
	}

	get multipartRepo(): MultipartRepository {
		if (!this._multipartRepo) {
			this._multipartRepo = new MultipartRepository(this.dbManager.rawDb);
		}
		return this._multipartRepo;
	}

	get lockManager(): LockManager {
		if (!this._lockManager) {
			this._lockManager = new LockManager(this.dbManager.rawDb);
		}
		return this._lockManager;
	}

	get cacheManager(): ObjectCacheManager {
		if (!this._cacheManager) {
			this._cacheManager = new ObjectCacheManager(this.dbManager.rawDb);
		}
		return this._cacheManager;
	}

	get snapshotRepo(): SnapshotRepository {
		if (!this._snapshotRepo) {
			this._snapshotRepo = new SnapshotRepository(
				this.options.customSnapshotsDir,
			);
		}
		return this._snapshotRepo;
	}

	get uploadedFileRepo(): UploadedFileRepository {
		if (!this._uploadedFileRepo) {
			this._uploadedFileRepo = new UploadedFileRepository(this.dbManager.rawDb);
		}
		return this._uploadedFileRepo;
	}

	resolveRuntime(overrides: CliConfigOverrides = {}): {
		runtimeConfig: ResolvedRuntimeConfig;
		credentials: SecretCredentials | null;
		storage: StorageBackend;
	} {
		const profile = this.configManager.getProfile(overrides.profile);
		const runtimeConfig = ConfigResolver.resolve(profile, overrides);

		const credentials: SecretCredentials | null = null;
		if (runtimeConfig.provider !== "mock") {
			// In synchronous initialization, we can read cached/env/file credentials
			// Or resolver can be awaited by use cases
		}

		const storage = BackendFactory.create(runtimeConfig, credentials);

		return {
			runtimeConfig,
			credentials,
			storage,
		};
	}

	async resolveStorageWithCredentials(
		overrides: CliConfigOverrides = {},
	): Promise<{
		runtimeConfig: ResolvedRuntimeConfig;
		credentials: SecretCredentials | null;
		storage: StorageBackend;
	}> {
		const profile = this.configManager.getProfile(overrides.profile);
		const runtimeConfig = ConfigResolver.resolve(profile, overrides);

		let credentials: SecretCredentials | null = null;
		if (runtimeConfig.provider !== "mock") {
			credentials = await this.secretResolver.resolve(
				runtimeConfig.profileName,
				false,
			);
		}

		const storage = BackendFactory.create(runtimeConfig, credentials);

		return {
			runtimeConfig,
			credentials,
			storage,
		};
	}
}

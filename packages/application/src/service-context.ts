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
	readonly configManager: ConfigManager;
	readonly secretResolver: MultiTierSecretResolver;
	readonly dbManager: DatabaseManager;
	readonly transferRepo: TransferRepository;
	readonly multipartRepo: MultipartRepository;
	readonly lockManager: LockManager;
	readonly cacheManager: ObjectCacheManager;
	readonly snapshotRepo: SnapshotRepository;
	readonly uploadedFileRepo: UploadedFileRepository;

	constructor(
		options: {
			customConfigPath?: string;
			customDbPath?: string;
			customSnapshotsDir?: string;
		} = {},
	) {
		this.configManager = new ConfigManager(options.customConfigPath);
		this.secretResolver = new MultiTierSecretResolver();
		this.dbManager = new DatabaseManager(options.customDbPath);
		this.transferRepo = new TransferRepository(this.dbManager.rawDb);
		this.multipartRepo = new MultipartRepository(this.dbManager.rawDb);
		this.lockManager = new LockManager(this.dbManager.rawDb);
		this.cacheManager = new ObjectCacheManager(this.dbManager.rawDb);
		this.snapshotRepo = new SnapshotRepository(options.customSnapshotsDir);
		this.uploadedFileRepo = new UploadedFileRepository(this.dbManager.rawDb);
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

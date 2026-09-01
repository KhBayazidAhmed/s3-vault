import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { VaultObject } from "@S3-vault-CLI/domain";
import type { ServiceContext } from "../service-context.js";

export interface ListObjectsOptions extends CliConfigOverrides {
	path?: string;
	recursive?: boolean;
	maxKeys?: number;
}

export class ListObjectsUseCase {
	constructor(private context: ServiceContext) {}

	async execute(options: ListObjectsOptions = {}): Promise<VaultObject[]> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const prefix = options.path
			? options.path.replace(/^\/+/, "")
			: runtimeConfig.prefix;

		const objects: VaultObject[] = [];
		for await (const obj of storage.listObjects({
			bucket: runtimeConfig.bucket,
			prefix,
			maxKeys: options.maxKeys,
		})) {
			objects.push(obj);
			// Cache object
			this.context.cacheManager.cacheObject(
				runtimeConfig.profileName,
				runtimeConfig.bucket,
				obj,
			);
		}

		return objects;
	}
}

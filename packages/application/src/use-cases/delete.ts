import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { ServiceContext } from "../service-context.js";

export interface DeleteOptions extends CliConfigOverrides {
	path: string;
	recursive?: boolean;
	dryRun?: boolean;
}

export interface DeleteResult {
	deletedCount: number;
	deletedKeys: string[];
	isPrefix: boolean;
	dryRun: boolean;
}

export class DeleteUseCase {
	constructor(private context: ServiceContext) {}

	async execute(options: DeleteOptions): Promise<DeleteResult> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);

		const cleanPath = options.path.replace(/^\/+/, "");
		const isDirectoryOrPrefix =
			options.recursive || cleanPath.endsWith("/") || cleanPath === "";

		const deletedKeys: string[] = [];

		if (isDirectoryOrPrefix) {
			const prefix = cleanPath;
			// Gather all objects under the prefix
			for await (const obj of storage.listObjects({
				bucket: runtimeConfig.bucket,
				prefix,
			})) {
				deletedKeys.push(obj.key);
			}

			// Also check if the prefix itself exists as an exact key (e.g. folder marker)
			if (prefix && !deletedKeys.includes(prefix)) {
				try {
					const head = await storage.headObject({
						bucket: runtimeConfig.bucket,
						key: prefix,
					});
					if (head) {
						deletedKeys.push(prefix);
					}
				} catch {
					// Ignore
				}
			}

			if (!options.dryRun) {
				for (const key of deletedKeys) {
					await storage.deleteObject({
						bucket: runtimeConfig.bucket,
						key,
					});
					this.context.uploadedFileRepo.removeByRemoteKey(
						runtimeConfig.profileName,
						runtimeConfig.bucket,
						key,
					);
				}
				this.context.cacheManager.evictPrefix(
					runtimeConfig.profileName,
					runtimeConfig.bucket,
					prefix,
				);
			}

			return {
				deletedCount: deletedKeys.length,
				deletedKeys,
				isPrefix: true,
				dryRun: !!options.dryRun,
			};
		}

		// Single object delete
		deletedKeys.push(cleanPath);
		if (!options.dryRun) {
			await storage.deleteObject({
				bucket: runtimeConfig.bucket,
				key: cleanPath,
			});
			this.context.uploadedFileRepo.removeByRemoteKey(
				runtimeConfig.profileName,
				runtimeConfig.bucket,
				cleanPath,
			);
			this.context.cacheManager.evictObject(
				runtimeConfig.profileName,
				runtimeConfig.bucket,
				cleanPath,
			);
		}

		return {
			deletedCount: 1,
			deletedKeys,
			isPrefix: false,
			dryRun: !!options.dryRun,
		};
	}
}

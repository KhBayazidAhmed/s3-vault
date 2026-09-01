import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { VaultObject } from "@S3-vault-CLI/domain";
import type { ServiceContext } from "../service-context.js";

export interface SearchOptions extends CliConfigOverrides {
	query: string;
	prefix?: string;
	minSizeBytes?: number;
	maxSizeBytes?: number;
	modifiedAfter?: Date;
	modifiedBefore?: Date;
}

export class SearchUseCase {
	constructor(private context: ServiceContext) {}

	async execute(options: SearchOptions): Promise<VaultObject[]> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const prefix = options.prefix ?? runtimeConfig.prefix;
		const queryRegex = new RegExp(options.query, "i");

		const matches: VaultObject[] = [];
		for await (const obj of storage.listObjects({
			bucket: runtimeConfig.bucket,
			prefix,
		})) {
			if (!queryRegex.test(obj.key)) {
				continue;
			}

			if (
				options.minSizeBytes !== undefined &&
				obj.size < options.minSizeBytes
			) {
				continue;
			}

			if (
				options.maxSizeBytes !== undefined &&
				obj.size > options.maxSizeBytes
			) {
				continue;
			}

			if (
				options.modifiedAfter &&
				new Date(obj.lastModified) < options.modifiedAfter
			) {
				continue;
			}

			if (
				options.modifiedBefore &&
				new Date(obj.lastModified) > options.modifiedBefore
			) {
				continue;
			}

			matches.push(obj);
		}

		return matches;
	}
}

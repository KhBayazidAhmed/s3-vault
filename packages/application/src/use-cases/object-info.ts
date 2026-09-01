import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import { NotFoundError, type ObjectMetadata } from "@S3-vault-CLI/domain";
import type { ServiceContext } from "../service-context.js";

export class ObjectInfoUseCase {
	constructor(private context: ServiceContext) {}

	async execute(
		key: string,
		options: CliConfigOverrides = {},
	): Promise<ObjectMetadata> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const cleanKey = key.replace(/^\/+/, "");

		const metadata = await storage.headObject({
			bucket: runtimeConfig.bucket,
			key: cleanKey,
		});

		if (!metadata) {
			throw new NotFoundError(
				`Object '${cleanKey}' not found in bucket '${runtimeConfig.bucket}'.`,
				{
					bucket: runtimeConfig.bucket,
					key: cleanKey,
				},
			);
		}

		return metadata;
	}
}

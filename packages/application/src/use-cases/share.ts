import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import type { ServiceContext } from "../service-context.js";

export interface ShareOptions extends CliConfigOverrides {
	key: string;
	expiresInSeconds?: number;
	method?: "GET" | "PUT";
}

export class ShareUseCase {
	constructor(private context: ServiceContext) {}

	async execute(
		options: ShareOptions,
	): Promise<{ url: string; expiresInSeconds: number; method: string }> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);
		const cleanKey = options.key.replace(/^\/+/, "");
		const expiresIn = options.expiresInSeconds ?? 3600;
		const method = options.method ?? "GET";

		const url = await storage.createPresignedUrl({
			bucket: runtimeConfig.bucket,
			key: cleanKey,
			method,
			expiresInSeconds: expiresIn,
		});

		return {
			url,
			expiresInSeconds: expiresIn,
			method,
		};
	}
}

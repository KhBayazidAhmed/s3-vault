import type { CliConfigOverrides } from "@S3-vault-CLI/config";
import {
	ChecksumUtils,
	NotFoundError,
	type ObjectMetadata,
} from "@S3-vault-CLI/domain";
import { createReadStream, existsSync } from "node:fs";
import type { ServiceContext } from "../service-context.js";

export interface VerifyResult {
	localPath: string;
	remoteKey: string;
	isMatch: boolean;
	algorithm: "sha256" | "etag";
	localChecksum: string;
	remoteChecksum: string;
	repairHint?: string;
	metadata?: ObjectMetadata;
}

export class VerifyUseCase {
	constructor(private context: ServiceContext) {}

	async execute(
		localPath: string,
		remoteKey: string,
		options: CliConfigOverrides = {},
	): Promise<VerifyResult> {
		const { runtimeConfig, storage } =
			await this.context.resolveStorageWithCredentials(options);

		if (!existsSync(localPath)) {
			throw new NotFoundError(`Local file '${localPath}' does not exist.`);
		}

		const cleanKey = remoteKey.replace(/^\/+/, "");
		const head = await storage.headObject({
			bucket: runtimeConfig.bucket,
			key: cleanKey,
		});

		if (!head) {
			throw new NotFoundError(
				`Remote object '${cleanKey}' not found in bucket '${runtimeConfig.bucket}'.`,
			);
		}

		// 1. If remote has SHA-256 in metadata, check against local SHA-256
		if (head.checksumSha256) {
			const { hash: localSha256 } = await ChecksumUtils.hashStream(
				createReadStream(localPath),
				"sha256",
			);
			const isMatch =
				localSha256.toLowerCase() === head.checksumSha256.toLowerCase();

			return {
				localPath,
				remoteKey: cleanKey,
				isMatch,
				algorithm: "sha256",
				localChecksum: localSha256,
				remoteChecksum: head.checksumSha256,
				repairHint: isMatch
					? undefined
					: `Re-upload local file with 'vault push ${localPath} ${cleanKey}'`,
				metadata: head,
			};
		}

		// 2. Fall back to MD5 / ETag verification
		const { hash: localMd5 } = await ChecksumUtils.hashStream(
			createReadStream(localPath),
			"md5",
		);
		const isMultipart = ChecksumUtils.isMultipartETag(head.etag);

		let isMatch = false;
		if (!isMultipart) {
			isMatch = ChecksumUtils.verifyETag(localMd5, head.etag);
		} else {
			// For multipart ETag, if single MD5 doesn't match, we report ETag
			isMatch = false;
		}

		return {
			localPath,
			remoteKey: cleanKey,
			isMatch,
			algorithm: "etag",
			localChecksum: localMd5,
			remoteChecksum: head.etag.replace(/["']/g, ""),
			repairHint: isMatch
				? undefined
				: `Re-upload with 'vault push ${localPath} ${cleanKey}' to calculate and attach SHA-256 metadata.`,
			metadata: head,
		};
	}
}

import {
	ChecksumUtils,
	IntegrityError,
	type TransferItem,
} from "@S3-vault-CLI/domain";
import type { MultipartRepository } from "@S3-vault-CLI/state";
import type { PutObjectResult, StorageBackend } from "@S3-vault-CLI/storage";
import { createReadStream } from "node:fs";
import type { StateWarning } from "./engine-files.js";
import type { ResolvedEngineOptions } from "./engine-options.js";
import { MultipartUploader } from "./multipart-uploader.js";
import { type RetryOptions, RetryUtils } from "./retry.js";

export class EngineUploader {
	private readonly multipart: MultipartUploader;

	constructor(
		private readonly storage: StorageBackend,
		multipartRepository: MultipartRepository | undefined,
		private readonly options: ResolvedEngineOptions,
		private readonly retryOptions: RetryOptions,
		warn: StateWarning,
	) {
		this.multipart = new MultipartUploader(
			storage,
			multipartRepository,
			options,
			retryOptions,
			warn,
		);
	}

	async upload(
		item: TransferItem,
		onBytes: (bytes: number) => void,
	): Promise<PutObjectResult> {
		if (item.size >= this.options.multipartThresholdBytes) {
			return await this.multipart.upload(item, onBytes);
		}
		const result = await RetryUtils.withRetry(async () => {
			let sha256: string | undefined;
			if (this.options.verifyChecksum) {
				if (item.localHash) {
					sha256 = item.localHash;
				} else {
					sha256 = (
						await ChecksumUtils.hashStream(
							createReadStream(item.sourcePath),
							"sha256",
						)
					).hash;
					item.localHash = sha256;
				}
			}
			const putResult = await this.storage.putObject({
				bucket: this.options.bucket,
				key: item.targetPath,
				body: createReadStream(item.sourcePath),
				size: item.size,
				checksumSha256: sha256,
			});
			if (
				this.options.verifyChecksum &&
				sha256 &&
				putResult.checksumSha256 &&
				sha256.toLowerCase() !== putResult.checksumSha256.toLowerCase()
			) {
				throw new IntegrityError(
					`Uploaded object '${item.targetPath}' checksum mismatch (expected ${sha256}, got ${putResult.checksumSha256}).`,
					{
						key: item.targetPath,
						expectedChecksum: sha256,
						actualChecksum: putResult.checksumSha256,
					},
				);
			}
			return putResult;
		}, this.retryOptions);
		onBytes(item.size);
		return result;
	}
}

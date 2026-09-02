import {
	ChecksumUtils,
	IntegrityError,
	type TransferItem,
} from "@S3-vault-CLI/domain";
import type { UploadedFileRepository } from "@S3-vault-CLI/state";
import type { PutObjectResult, StorageBackend } from "@S3-vault-CLI/storage";
import { randomUUID } from "node:crypto";
import {
	createReadStream,
	createWriteStream,
	mkdirSync,
	statSync,
} from "node:fs";
import { basename, dirname } from "node:path";
import type { ResolvedEngineOptions } from "./engine-options.js";
import { type RetryOptions, RetryUtils } from "./retry.js";

export type StateWarning = (item: TransferItem, message: string) => void;

export async function downloadItem(
	storage: StorageBackend,
	options: ResolvedEngineOptions,
	retryOptions: RetryOptions,
	item: TransferItem,
	onBytes: (bytes: number) => void,
): Promise<void> {
	const key = item.sourcePath;
	const targetFile = item.targetPath;
	mkdirSync(dirname(targetFile), { recursive: true });
	await RetryUtils.withRetry(async () => {
		const stream = await storage.getObject({ bucket: options.bucket, key });
		const writeStream = createWriteStream(targetFile);
		await new Promise<void>((resolve, reject) => {
			stream.on("data", (chunk: Buffer) => onBytes(chunk.length));
			stream.pipe(writeStream);
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			stream.on("error", reject);
		});
		if (
			options.verifyChecksum &&
			item.remoteHash &&
			!ChecksumUtils.isMultipartETag(item.remoteHash)
		) {
			const { hash } = await ChecksumUtils.hashStream(
				createReadStream(targetFile),
				"sha256",
			);
			const remoteClean = item.remoteHash.replace(/["']/g, "").toLowerCase();
			if (remoteClean.length === 64 && hash.toLowerCase() !== remoteClean) {
				throw new IntegrityError(
					`Downloaded file '${targetFile}' checksum mismatch (expected ${remoteClean}, got ${hash}).`,
					{ key, expectedChecksum: remoteClean, actualChecksum: hash },
				);
			}
		}
	}, retryOptions);
}

export function recordSuccessfulUpload(
	repository: UploadedFileRepository | undefined,
	options: ResolvedEngineOptions,
	item: TransferItem,
	result: PutObjectResult | undefined,
	warn: StateWarning,
): void {
	if (!repository || !item.localHash) return;
	try {
		const stats = statSync(item.sourcePath);
		const sourceMtime = item.localLastModified?.getTime();
		if (
			stats.size !== item.size ||
			(sourceMtime !== undefined && Math.abs(stats.mtimeMs - sourceMtime) >= 1)
		) {
			warn(item, "Source changed during upload; upload marker was not saved.");
			return;
		}
		repository.upsertSuccessfulUpload({
			id: randomUUID(),
			profileName: options.profileName,
			bucket: options.bucket,
			remoteKey: item.targetPath,
			localPath: item.sourcePath,
			localName: basename(item.sourcePath),
			fileSize: stats.size,
			localMtimeMs: stats.mtimeMs,
			localSha256: item.localHash,
			deviceId: stats.dev,
			inode: stats.ino,
			remoteEtag: result?.etag ?? item.remoteHash,
			remoteChecksumSha256:
				result?.checksumSha256 ??
				(item.remoteHash && /^[a-f\d]{64}$/i.test(item.remoteHash)
					? item.remoteHash
					: undefined),
			uploadedAt: new Date(),
		});
	} catch (error) {
		warn(item, error instanceof Error ? error.message : String(error));
	}
}

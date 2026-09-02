import {
	ChecksumUtils,
	NotFoundError,
	type ObjectMetadata,
} from "@S3-vault-CLI/domain";
import {
	type AbortMultipartInput,
	type CompleteMultipartInput,
	type DeleteObjectInput,
	type GetObjectInput,
	type HeadObjectInput,
	type HealthCheckResult,
	type ListObjectsInput,
	type MultipartInput,
	type PresignInput,
	type PutObjectInput,
	type PutObjectResult,
	type StorageBackend,
	type StorageCapabilities,
	StreamUtils,
	type UploadedPart,
	type UploadPartInput,
} from "@S3-vault-CLI/storage";
import type { Readable } from "node:stream";
import { LocalFileStore } from "./local-fs-store.js";

export class LocalFileSystemStorageBackend implements StorageBackend {
	readonly name = "local-filesystem-mock";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: false,
		supportsByteRanges: true,
	};

	private readonly store: LocalFileStore;

	constructor(rootDir: string) {
		this.store = new LocalFileStore(rootDir);
	}

	async headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		return this.store.head(input.bucket, input.key);
	}

	async getObject(input: GetObjectInput): Promise<Readable> {
		const stream = this.store.open(input.bucket, input.key, input.range);
		if (!stream) throw new NotFoundError(`Object '${input.key}' not found.`);
		return stream;
	}

	async putObject(input: PutObjectInput): Promise<PutObjectResult> {
		const buffer = await StreamUtils.toBuffer(input.body);
		const md5 = ChecksumUtils.md5(buffer);
		const checksumSha256 = input.checksumSha256 ?? ChecksumUtils.sha256(buffer);
		const etag = `"${md5}"`;
		const metadata: ObjectMetadata = {
			key: input.key,
			size: buffer.length,
			lastModified: new Date(),
			etag,
			contentType: input.contentType ?? "application/octet-stream",
			checksumSha256,
			storageClass: input.storageClass ?? "STANDARD",
			userMetadata: input.userMetadata,
		};
		this.store.write(input.bucket, input.key, buffer, metadata);
		return { etag, checksumSha256 };
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		const prefix = input.prefix ?? "";
		for (const key of this.store.listKeys(input.bucket)) {
			if (!key.startsWith(prefix)) continue;
			const metadata = this.store.head(input.bucket, key);
			if (metadata) yield metadata;
		}
	}

	async deleteObject(input: DeleteObjectInput): Promise<void> {
		this.store.delete(input.bucket, input.key);
	}

	async createMultipartUpload(
		input: MultipartInput,
	): Promise<{ uploadId: string }> {
		return { uploadId: this.store.createSession(input) };
	}

	async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		if (!this.store.hasSession(input.uploadId)) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}
		const data = await StreamUtils.toBuffer(input.body);
		this.store.writePart(input.uploadId, input.partNumber, data);
		const etag = `"${ChecksumUtils.md5(data)}"`;
		const checksumSha256 = input.checksumSha256 ?? ChecksumUtils.sha256(data);
		return {
			partNumber: input.partNumber,
			etag,
			checksumSha256,
			size: data.length,
		};
	}

	async completeMultipartUpload(
		input: CompleteMultipartInput,
	): Promise<PutObjectResult> {
		if (!this.store.hasSession(input.uploadId)) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		const partBuffers: Buffer[] = [];
		const partMd5s: string[] = [];
		const sortedParts = [...input.parts].sort(
			(left, right) => left.partNumber - right.partNumber,
		);
		for (const part of sortedParts) {
			const data = this.store.readPart(input.uploadId, part.partNumber);
			if (!data) {
				throw new NotFoundError(`Part ${part.partNumber} not found.`);
			}
			partBuffers.push(data);
			partMd5s.push(part.etag.replace(/["']/g, ""));
		}

		const combined = Buffer.concat(partBuffers);
		const etag = `"${ChecksumUtils.computeMultipartETag(partMd5s)}"`;
		const checksumSha256 = ChecksumUtils.sha256(combined);
		await this.putObject({
			bucket: input.bucket,
			key: input.key,
			body: combined,
			checksumSha256,
		});
		return { etag, checksumSha256 };
	}

	async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
		this.store.abortSession(input.uploadId);
	}

	async createPresignedUrl(input: PresignInput): Promise<string> {
		return this.store.objectUrl(input.bucket, input.key);
	}

	async checkHealth(): Promise<HealthCheckResult> {
		return { ok: true, latencyMs: 1, bucketExists: true };
	}
}

import {
	ChecksumUtils,
	NotFoundError,
	type ObjectMetadata,
	type UserMetadata,
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
import { Readable } from "node:stream";

interface StoredObject {
	data: Buffer;
	metadata: ObjectMetadata;
}

interface InFlightMultipart {
	bucket: string;
	key: string;
	contentType?: string;
	userMetadata?: UserMetadata;
	storageClass?: string;
	parts: Map<
		number,
		{ data: Buffer; etag: string; checksumSha256?: string; size: number }
	>;
}

export interface InjectedFailure {
	operation:
		| "putObject"
		| "getObject"
		| "uploadPart"
		| "listObjects"
		| "headObject";
	keyPattern?: RegExp;
	partNumber?: number;
	timesRemaining: number;
	error: Error;
}

export class InMemoryStorageBackend implements StorageBackend {
	readonly name = "in-memory-mock";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: false,
		supportsByteRanges: true,
	};

	private objects: Map<string, StoredObject> = new Map();
	private multipartSessions: Map<string, InFlightMultipart> = new Map();
	private failureRules: InjectedFailure[] = [];

	private makeObjectKey(bucket: string, key: string): string {
		return `${bucket}:::${key}`;
	}

	injectFailure(rule: InjectedFailure): void {
		this.failureRules.push(rule);
	}

	clearFailures(): void {
		this.failureRules = [];
	}

	private checkFailure(
		operation: InjectedFailure["operation"],
		key?: string,
		partNumber?: number,
	): void {
		for (let i = 0; i < this.failureRules.length; i++) {
			const rule = this.failureRules[i];
			if (!rule || rule.timesRemaining <= 0) continue;

			if (rule.operation === operation) {
				if (rule.keyPattern && key && !rule.keyPattern.test(key)) {
					continue;
				}
				if (
					rule.partNumber !== undefined &&
					partNumber !== undefined &&
					rule.partNumber !== partNumber
				) {
					continue;
				}

				rule.timesRemaining--;
				throw rule.error;
			}
		}
	}

	async headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		this.checkFailure("headObject", input.key);
		const key = this.makeObjectKey(input.bucket, input.key);
		const item = this.objects.get(key);
		return item ? { ...item.metadata } : null;
	}

	async getObject(input: GetObjectInput): Promise<Readable> {
		this.checkFailure("getObject", input.key);
		const key = this.makeObjectKey(input.bucket, input.key);
		const item = this.objects.get(key);
		if (!item) {
			throw new NotFoundError(
				`Object '${input.key}' not found in bucket '${input.bucket}'.`,
				{
					bucket: input.bucket,
					key: input.key,
				},
			);
		}

		let buffer = item.data;
		if (input.range) {
			const match = input.range.match(/bytes=(\d+)-(\d*)/);
			if (match && match[1]) {
				const start = Number.parseInt(match[1], 10);
				const end = match[2]
					? Number.parseInt(match[2], 10) + 1
					: buffer.length;
				buffer = buffer.subarray(start, end);
			}
		}

		return Readable.from([buffer]);
	}

	async putObject(input: PutObjectInput): Promise<PutObjectResult> {
		this.checkFailure("putObject", input.key);
		const buf = await StreamUtils.toBuffer(input.body);
		const md5 = ChecksumUtils.md5(buf);
		const sha256 = input.checksumSha256 ?? ChecksumUtils.sha256(buf);
		const etag = `"${md5}"`;

		const metadata: ObjectMetadata = {
			key: input.key,
			size: buf.length,
			lastModified: new Date(),
			etag,
			contentType: input.contentType ?? "application/octet-stream",
			checksumSha256: sha256,
			storageClass: input.storageClass ?? "STANDARD",
			userMetadata: input.userMetadata,
		};

		const objectKey = this.makeObjectKey(input.bucket, input.key);
		this.objects.set(objectKey, { data: buf, metadata });

		return {
			etag,
			checksumSha256: sha256,
		};
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		this.checkFailure("listObjects");
		const prefix = input.prefix ?? "";
		const bucketPrefix = `${input.bucket}:::`;

		for (const [key, item] of this.objects.entries()) {
			if (!key.startsWith(bucketPrefix)) continue;
			const objectKey = key.slice(bucketPrefix.length);

			if (objectKey.startsWith(prefix)) {
				yield { ...item.metadata };
			}
		}
	}

	async deleteObject(input: DeleteObjectInput): Promise<void> {
		const key = this.makeObjectKey(input.bucket, input.key);
		this.objects.delete(key);
	}

	async createMultipartUpload(
		input: MultipartInput,
	): Promise<{ uploadId: string }> {
		const uploadId = `mock-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.multipartSessions.set(uploadId, {
			bucket: input.bucket,
			key: input.key,
			contentType: input.contentType,
			userMetadata: input.userMetadata,
			storageClass: input.storageClass,
			parts: new Map(),
		});
		return { uploadId };
	}

	async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		this.checkFailure("uploadPart", input.key, input.partNumber);
		const session = this.multipartSessions.get(input.uploadId);
		if (!session) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		const buf = await StreamUtils.toBuffer(input.body);
		const md5 = ChecksumUtils.md5(buf);
		const etag = `"${md5}"`;
		const sha256 = input.checksumSha256 ?? ChecksumUtils.sha256(buf);

		session.parts.set(input.partNumber, {
			data: buf,
			etag,
			checksumSha256: sha256,
			size: buf.length,
		});

		return {
			partNumber: input.partNumber,
			etag,
			checksumSha256: sha256,
			size: buf.length,
		};
	}

	async completeMultipartUpload(
		input: CompleteMultipartInput,
	): Promise<PutObjectResult> {
		const session = this.multipartSessions.get(input.uploadId);
		if (!session) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		// Sort parts by part number
		const sortedParts = [...input.parts].sort(
			(a, b) => a.partNumber - b.partNumber,
		);
		const partBuffers: Buffer[] = [];
		const partMd5s: string[] = [];

		for (const part of sortedParts) {
			const storedPart = session.parts.get(part.partNumber);
			if (!storedPart) {
				throw new NotFoundError(
					`Part ${part.partNumber} not found for upload '${input.uploadId}'.`,
				);
			}
			partBuffers.push(storedPart.data);
			partMd5s.push(storedPart.etag.replace(/["']/g, ""));
		}

		const combinedBuffer = Buffer.concat(partBuffers);
		const multiEtag = `"${ChecksumUtils.computeMultipartETag(partMd5s)}"`;
		const totalSha256 = ChecksumUtils.sha256(combinedBuffer);

		const metadata: ObjectMetadata = {
			key: input.key,
			size: combinedBuffer.length,
			lastModified: new Date(),
			etag: multiEtag,
			contentType: session.contentType ?? "application/octet-stream",
			checksumSha256: totalSha256,
			storageClass: session.storageClass ?? "STANDARD",
			userMetadata: session.userMetadata,
		};

		const objectKey = this.makeObjectKey(input.bucket, input.key);
		this.objects.set(objectKey, { data: combinedBuffer, metadata });
		this.multipartSessions.delete(input.uploadId);

		return {
			etag: multiEtag,
			checksumSha256: totalSha256,
		};
	}

	async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
		this.multipartSessions.delete(input.uploadId);
	}

	async createPresignedUrl(input: PresignInput): Promise<string> {
		const expires = input.expiresInSeconds ?? 3600;
		const token = `sig_${Math.random().toString(36).slice(2, 10)}`;
		return `https://mock.s3.vault.local/${input.bucket}/${input.key}?method=${input.method}&expires=${expires}&signature=${token}`;
	}

	async checkHealth(_bucket: string): Promise<HealthCheckResult> {
		return {
			ok: true,
			latencyMs: 1,
			bucketExists: true,
		};
	}
}

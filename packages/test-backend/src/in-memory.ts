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
import { Readable } from "node:stream";
import {
	FailureInjector,
	type InjectedFailure,
	InMemoryObjectStore,
	MultipartSessionStore,
} from "./in-memory-state.js";

export type { InjectedFailure } from "./in-memory-state.js";

export class InMemoryStorageBackend implements StorageBackend {
	readonly name = "in-memory-mock";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: false,
		supportsByteRanges: true,
	};

	private readonly objects = new InMemoryObjectStore();
	private readonly multipartSessions = new MultipartSessionStore();
	private readonly failures = new FailureInjector();

	injectFailure(rule: InjectedFailure): void {
		this.failures.inject(rule);
	}

	clearFailures(): void {
		this.failures.clear();
	}

	async headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		this.failures.check("headObject", input.key);
		const item = this.objects.get(input.bucket, input.key);
		return item ? { ...item.metadata } : null;
	}

	async getObject(input: GetObjectInput): Promise<Readable> {
		this.failures.check("getObject", input.key);
		const item = this.objects.get(input.bucket, input.key);
		if (!item) {
			throw new NotFoundError(
				`Object '${input.key}' not found in bucket '${input.bucket}'.`,
				{ bucket: input.bucket, key: input.key },
			);
		}

		let buffer = item.data;
		const match = input.range?.match(/bytes=(\d+)-(\d*)/);
		if (match?.[1]) {
			const start = Number.parseInt(match[1], 10);
			const end = match[2] ? Number.parseInt(match[2], 10) + 1 : buffer.length;
			buffer = buffer.subarray(start, end);
		}
		return Readable.from([buffer]);
	}

	async putObject(input: PutObjectInput): Promise<PutObjectResult> {
		this.failures.check("putObject", input.key);
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
		this.objects.set(input.bucket, input.key, { data: buffer, metadata });
		return { etag, checksumSha256 };
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		this.failures.check("listObjects");
		yield* this.objects.list(input.bucket, input.prefix ?? "");
	}

	async deleteObject(input: DeleteObjectInput): Promise<void> {
		this.objects.delete(input.bucket, input.key);
	}

	async createMultipartUpload(
		input: MultipartInput,
	): Promise<{ uploadId: string }> {
		const uploadId = this.multipartSessions.create({
			bucket: input.bucket,
			key: input.key,
			contentType: input.contentType,
			userMetadata: input.userMetadata,
			storageClass: input.storageClass,
		});
		return { uploadId };
	}

	async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		this.failures.check("uploadPart", input.key, input.partNumber);
		const session = this.multipartSessions.get(input.uploadId);
		if (!session) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		const data = await StreamUtils.toBuffer(input.body);
		const etag = `"${ChecksumUtils.md5(data)}"`;
		const checksumSha256 = input.checksumSha256 ?? ChecksumUtils.sha256(data);
		const part = {
			data,
			etag,
			checksumSha256,
			size: data.length,
		};
		session.parts.set(input.partNumber, part);
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
		const session = this.multipartSessions.get(input.uploadId);
		if (!session) {
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
			const storedPart = session.parts.get(part.partNumber);
			if (!storedPart) {
				throw new NotFoundError(
					`Part ${part.partNumber} not found for upload '${input.uploadId}'.`,
				);
			}
			partBuffers.push(storedPart.data);
			partMd5s.push(storedPart.etag.replace(/["']/g, ""));
		}

		const data = Buffer.concat(partBuffers);
		const etag = `"${ChecksumUtils.computeMultipartETag(partMd5s)}"`;
		const checksumSha256 = ChecksumUtils.sha256(data);
		const metadata: ObjectMetadata = {
			key: input.key,
			size: data.length,
			lastModified: new Date(),
			etag,
			contentType: session.contentType ?? "application/octet-stream",
			checksumSha256,
			storageClass: session.storageClass ?? "STANDARD",
			userMetadata: session.userMetadata,
		};
		this.objects.set(input.bucket, input.key, { data, metadata });
		this.multipartSessions.delete(input.uploadId);
		return { etag, checksumSha256 };
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
		return { ok: true, latencyMs: 1, bucketExists: true };
	}
}

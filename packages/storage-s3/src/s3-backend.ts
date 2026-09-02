import type { StorageProfileConfig } from "@S3-vault-CLI/config";
import type { ObjectMetadata } from "@S3-vault-CLI/domain";
import type { SecretCredentials } from "@S3-vault-CLI/secrets";
import type {
	AbortMultipartInput,
	CompleteMultipartInput,
	DeleteObjectInput,
	GetObjectInput,
	HeadObjectInput,
	HealthCheckResult,
	ListObjectsInput,
	MultipartInput,
	PresignInput,
	PutObjectInput,
	PutObjectResult,
	StorageBackend,
	StorageCapabilities,
	UploadedPart,
	UploadPartInput,
} from "@S3-vault-CLI/storage";
import type { Readable } from "node:stream";
import {
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3ErrorMapper } from "./error-mapper.js";
import { buildS3ClientConfig } from "./presets.js";
import { S3MultipartOperations } from "./s3-multipart-operations.js";
import { S3ObjectOperations } from "./s3-object-operations.js";

export class S3StorageBackend implements StorageBackend {
	readonly name = "aws-s3-compatible";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: true,
		supportsByteRanges: true,
	};

	private readonly client: S3Client;
	private readonly objects: S3ObjectOperations;
	private readonly multipart: S3MultipartOperations;

	constructor(
		profile: Partial<StorageProfileConfig>,
		credentials?: SecretCredentials,
	) {
		this.client = new S3Client(buildS3ClientConfig(profile, credentials));
		this.objects = new S3ObjectOperations(this.client);
		this.multipart = new S3MultipartOperations(this.client);
	}

	headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		return this.objects.head(input);
	}

	getObject(input: GetObjectInput): Promise<Readable> {
		return this.objects.get(input);
	}

	putObject(input: PutObjectInput): Promise<PutObjectResult> {
		return this.objects.put(input);
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		yield* this.objects.list(input);
	}

	deleteObject(input: DeleteObjectInput): Promise<void> {
		return this.objects.delete(input);
	}

	createMultipartUpload(input: MultipartInput): Promise<{ uploadId: string }> {
		return this.multipart.create(input);
	}

	uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		return this.multipart.uploadPart(input);
	}

	completeMultipartUpload(
		input: CompleteMultipartInput,
	): Promise<PutObjectResult> {
		return this.multipart.complete(input);
	}

	abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
		return this.multipart.abort(input);
	}

	async createPresignedUrl(input: PresignInput): Promise<string> {
		try {
			const command =
				input.method === "PUT"
					? new PutObjectCommand({ Bucket: input.bucket, Key: input.key })
					: new GetObjectCommand({ Bucket: input.bucket, Key: input.key });
			return await getSignedUrl(this.client, command, {
				expiresIn: input.expiresInSeconds ?? 3600,
			});
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "createPresignedUrl",
			});
		}
	}

	async checkHealth(bucket: string): Promise<HealthCheckResult> {
		const start = Date.now();
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
			return {
				ok: true,
				latencyMs: Date.now() - start,
				bucketExists: true,
			};
		} catch (error: unknown) {
			const mapped = S3ErrorMapper.toDomainError(error, {
				bucket,
				operation: "headBucket",
			});
			return {
				ok: false,
				latencyMs: Date.now() - start,
				bucketExists: mapped.name !== "NotFoundError",
				error: mapped.message,
			};
		}
	}
}

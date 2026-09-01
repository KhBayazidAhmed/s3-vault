import type { StorageProfileConfig } from "@S3-vault-CLI/config";
import type { ObjectMetadata } from "@S3-vault-CLI/domain";
import type { SecretCredentials } from "@S3-vault-CLI/secrets";
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
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3ErrorMapper } from "./error-mapper.js";
import { buildS3ClientConfig } from "./presets.js";

export class S3StorageBackend implements StorageBackend {
	readonly name = "aws-s3-compatible";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: true,
		supportsByteRanges: true,
	};

	private client: S3Client;

	constructor(
		profile: Partial<StorageProfileConfig>,
		credentials?: SecretCredentials,
	) {
		const config = buildS3ClientConfig(profile, credentials);
		this.client = new S3Client(config);
	}

	async headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		try {
			const response = await this.client.send(
				new HeadObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					VersionId: input.versionId,
				}),
			);

			return {
				key: input.key,
				size: response.ContentLength ?? 0,
				lastModified: response.LastModified ?? new Date(),
				etag: response.ETag ?? "",
				contentType: response.ContentType,
				checksumSha256:
					response.ChecksumSHA256 || response.Metadata?.["sha256"],
				storageClass: response.StorageClass ?? "STANDARD",
				userMetadata: response.Metadata,
				versionId: response.VersionId,
			};
		} catch (err: unknown) {
			const mapped = S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "headObject",
			});
			if (mapped.name === "NotFoundError" || mapped.code === "ERR_NOT_FOUND") {
				return null;
			}
			throw mapped;
		}
	}

	async getObject(input: GetObjectInput): Promise<Readable> {
		try {
			const response = await this.client.send(
				new GetObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					Range: input.range,
					VersionId: input.versionId,
				}),
			);

			if (!response.Body) {
				return Readable.from([]);
			}

			return StreamUtils.toReadable(response.Body as any);
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "getObject",
			});
		}
	}

	async putObject(input: PutObjectInput): Promise<PutObjectResult> {
		try {
			const buffer = await StreamUtils.toBuffer(input.body);
			const metadata: Record<string, string> = { ...input.userMetadata };
			if (input.checksumSha256) {
				metadata["sha256"] = input.checksumSha256;
			}

			const response = await this.client.send(
				new PutObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					Body: buffer,
					ContentLength: buffer.length,
					ContentType: input.contentType,
					Metadata: metadata,
					ChecksumSHA256: input.checksumSha256,
					StorageClass: (input.storageClass as any) || undefined,
				}),
			);

			return {
				etag: response.ETag ?? "",
				checksumSha256: response.ChecksumSHA256 || input.checksumSha256,
				versionId: response.VersionId,
			};
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "putObject",
			});
		}
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		let continuationToken = input.continuationToken;

		try {
			do {
				const response = await this.client.send(
					new ListObjectsV2Command({
						Bucket: input.bucket,
						Prefix: input.prefix,
						Delimiter: input.delimiter,
						MaxKeys: input.maxKeys,
						ContinuationToken: continuationToken,
					}),
				);

				if (response.Contents) {
					for (const item of response.Contents) {
						if (!item.Key) continue;
						yield {
							key: item.Key,
							size: item.Size ?? 0,
							lastModified: item.LastModified ?? new Date(),
							etag: item.ETag ?? "",
							storageClass: item.StorageClass ?? "STANDARD",
							checksumSha256: item.ChecksumAlgorithm ? undefined : undefined,
						};
					}
				}

				continuationToken = response.IsTruncated
					? response.NextContinuationToken
					: undefined;
			} while (continuationToken);
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				operation: "listObjects",
			});
		}
	}

	async deleteObject(input: DeleteObjectInput): Promise<void> {
		try {
			await this.client.send(
				new DeleteObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					VersionId: input.versionId,
				}),
			);
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "deleteObject",
			});
		}
	}

	async createMultipartUpload(
		input: MultipartInput,
	): Promise<{ uploadId: string }> {
		try {
			const metadata: Record<string, string> = { ...input.userMetadata };
			const response = await this.client.send(
				new CreateMultipartUploadCommand({
					Bucket: input.bucket,
					Key: input.key,
					ContentType: input.contentType,
					Metadata: metadata,
					StorageClass: (input.storageClass as any) || undefined,
				}),
			);

			if (!response.UploadId) {
				throw new Error(
					"S3 failed to return an UploadId for multipart upload.",
				);
			}

			return { uploadId: response.UploadId };
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "createMultipartUpload",
			});
		}
	}

	async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		try {
			const buffer = await StreamUtils.toBuffer(input.body);
			const response = await this.client.send(
				new UploadPartCommand({
					Bucket: input.bucket,
					Key: input.key,
					UploadId: input.uploadId,
					PartNumber: input.partNumber,
					Body: buffer,
					ContentLength: buffer.length,
					ChecksumSHA256: input.checksumSha256,
				}),
			);

			return {
				partNumber: input.partNumber,
				etag: response.ETag ?? "",
				checksumSha256: response.ChecksumSHA256 || input.checksumSha256,
				size: buffer.length,
			};
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: `uploadPart-${input.partNumber}`,
			});
		}
	}

	async completeMultipartUpload(
		input: CompleteMultipartInput,
	): Promise<PutObjectResult> {
		try {
			const response = await this.client.send(
				new CompleteMultipartUploadCommand({
					Bucket: input.bucket,
					Key: input.key,
					UploadId: input.uploadId,
					MultipartUpload: {
						Parts: input.parts.map((p) => ({
							PartNumber: p.partNumber,
							ETag: p.etag,
							ChecksumSHA256: p.checksumSha256,
						})),
					},
				}),
			);

			return {
				etag: response.ETag ?? "",
				checksumSha256: response.ChecksumSHA256,
				versionId: response.VersionId,
			};
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "completeMultipartUpload",
			});
		}
	}

	async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
		try {
			await this.client.send(
				new AbortMultipartUploadCommand({
					Bucket: input.bucket,
					Key: input.key,
					UploadId: input.uploadId,
				}),
			);
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
				bucket: input.bucket,
				key: input.key,
				operation: "abortMultipartUpload",
			});
		}
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
		} catch (err: unknown) {
			throw S3ErrorMapper.toDomainError(err, {
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
			const latencyMs = Date.now() - start;
			return {
				ok: true,
				latencyMs,
				bucketExists: true,
			};
		} catch (err: unknown) {
			const latencyMs = Date.now() - start;
			const mapped = S3ErrorMapper.toDomainError(err, {
				bucket,
				operation: "headBucket",
			});
			return {
				ok: false,
				latencyMs,
				bucketExists: mapped.name !== "NotFoundError",
				error: mapped.message,
			};
		}
	}
}

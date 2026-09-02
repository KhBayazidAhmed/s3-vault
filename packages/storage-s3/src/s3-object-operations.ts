import type { ObjectMetadata } from "@S3-vault-CLI/domain";
import {
	type DeleteObjectInput,
	type GetObjectInput,
	type HeadObjectInput,
	type ListObjectsInput,
	type PutObjectInput,
	type PutObjectResult,
	StreamUtils,
} from "@S3-vault-CLI/storage";
import { Readable } from "node:stream";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { S3ErrorMapper } from "./error-mapper.js";

export class S3ObjectOperations {
	constructor(private readonly client: S3Client) {}

	async head(input: HeadObjectInput): Promise<ObjectMetadata | null> {
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
				checksumSha256: response.ChecksumSHA256 || response.Metadata?.sha256,
				storageClass: response.StorageClass ?? "STANDARD",
				userMetadata: response.Metadata,
				versionId: response.VersionId,
			};
		} catch (error: unknown) {
			const mapped = S3ErrorMapper.toDomainError(error, {
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

	async get(input: GetObjectInput): Promise<Readable> {
		try {
			const response = await this.client.send(
				new GetObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					Range: input.range,
					VersionId: input.versionId,
				}),
			);
			return response.Body
				? StreamUtils.toReadable(response.Body as any)
				: Readable.from([]);
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "getObject",
			});
		}
	}

	async put(input: PutObjectInput): Promise<PutObjectResult> {
		try {
			const buffer = await StreamUtils.toBuffer(input.body);
			const metadata: Record<string, string> = { ...input.userMetadata };
			if (input.checksumSha256) metadata.sha256 = input.checksumSha256;

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
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "putObject",
			});
		}
	}

	async *list(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
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
				for (const item of response.Contents ?? []) {
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
				continuationToken = response.IsTruncated
					? response.NextContinuationToken
					: undefined;
			} while (continuationToken);
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				operation: "listObjects",
			});
		}
	}

	async delete(input: DeleteObjectInput): Promise<void> {
		try {
			await this.client.send(
				new DeleteObjectCommand({
					Bucket: input.bucket,
					Key: input.key,
					VersionId: input.versionId,
				}),
			);
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "deleteObject",
			});
		}
	}
}

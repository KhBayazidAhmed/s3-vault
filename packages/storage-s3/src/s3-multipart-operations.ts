import {
	type AbortMultipartInput,
	type CompleteMultipartInput,
	type MultipartInput,
	type PutObjectResult,
	StreamUtils,
	type UploadedPart,
	type UploadPartInput,
} from "@S3-vault-CLI/storage";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	type S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { S3ErrorMapper } from "./error-mapper.js";

export class S3MultipartOperations {
	constructor(private readonly client: S3Client) {}

	async create(input: MultipartInput): Promise<{ uploadId: string }> {
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
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
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
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: `uploadPart-${input.partNumber}`,
			});
		}
	}

	async complete(input: CompleteMultipartInput): Promise<PutObjectResult> {
		try {
			const response = await this.client.send(
				new CompleteMultipartUploadCommand({
					Bucket: input.bucket,
					Key: input.key,
					UploadId: input.uploadId,
					MultipartUpload: {
						Parts: input.parts.map((part) => ({
							PartNumber: part.partNumber,
							ETag: part.etag,
							ChecksumSHA256: part.checksumSha256,
						})),
					},
				}),
			);
			return {
				etag: response.ETag ?? "",
				checksumSha256: response.ChecksumSHA256,
				versionId: response.VersionId,
			};
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "completeMultipartUpload",
			});
		}
	}

	async abort(input: AbortMultipartInput): Promise<void> {
		try {
			await this.client.send(
				new AbortMultipartUploadCommand({
					Bucket: input.bucket,
					Key: input.key,
					UploadId: input.uploadId,
				}),
			);
		} catch (error: unknown) {
			throw S3ErrorMapper.toDomainError(error, {
				bucket: input.bucket,
				key: input.key,
				operation: "abortMultipartUpload",
			});
		}
	}
}

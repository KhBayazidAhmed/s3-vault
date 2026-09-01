import { describe, expect, it } from "bun:test";
import { S3ErrorMapper } from "../src/error-mapper.js";
import { buildS3ClientConfig } from "../src/presets.js";

describe("Storage S3: Presets & Error Mapping", () => {
	it("generates correct client configuration for Cloudflare R2", () => {
		const config = buildS3ClientConfig({
			name: "my-r2",
			provider: "cloudflare-r2",
			bucket: "r2-bucket",
			endpoint: "https://acc123.r2.cloudflarestorage.com",
		});

		expect(config.region).toBe("auto");
		expect(config.forcePathStyle).toBe(true);
		expect(config.endpoint).toBe("https://acc123.r2.cloudflarestorage.com");
	});

	it("generates correct client configuration for MinIO", () => {
		const config = buildS3ClientConfig({
			name: "local-minio",
			provider: "minio",
			bucket: "minio-bucket",
			endpoint: "http://localhost:9000",
			region: "us-east-1",
		});

		expect(config.forcePathStyle).toBe(true);
		expect(config.endpoint).toBe("http://localhost:9000");
	});

	it("generates correct client configuration for Custom S3", () => {
		const config = buildS3ClientConfig({
			name: "biz",
			provider: "custom-s3",
			bucket: "test-vault",
			endpoint: "https://t2.tenbytecloud.com",
		});

		expect(config.region).toBe("us-east-1");
		expect(config.forcePathStyle).toBe(true);
		expect(config.endpoint).toBe("https://t2.tenbytecloud.com");
	});

	it("maps NoSuchKey to NotFoundError with details", () => {
		const mapped = S3ErrorMapper.toDomainError(
			{
				name: "NoSuchKey",
				message: "The specified key does not exist.",
				$metadata: { httpStatusCode: 404 },
			},
			{ bucket: "b1", key: "missing.txt" },
		);

		expect(mapped.name).toBe("NotFoundError");
		expect(mapped.code).toBe("ERR_NOT_FOUND");
		expect(mapped.exitCode).toBe(1);
		expect(mapped.details.key).toBe("missing.txt");
	});

	it("maps HeadBucket 404 / NotFound to bucket NotFoundError", () => {
		const mapped = S3ErrorMapper.toDomainError(
			{
				name: "NotFound",
				$metadata: { httpStatusCode: 404 },
			},
			{ bucket: "test-vault", operation: "headBucket" },
		);

		expect(mapped.name).toBe("NotFoundError");
		expect(mapped.message).toBe("Bucket 'test-vault' does not exist.");
		expect(mapped.exitCode).toBe(1);
	});

	it("maps NoSuchBucket to bucket NotFoundError", () => {
		const mapped = S3ErrorMapper.toDomainError(
			{
				name: "NoSuchBucket",
				message: "The specified bucket does not exist",
				$metadata: { httpStatusCode: 404 },
			},
			{ bucket: "test-vault" },
		);

		expect(mapped.name).toBe("NotFoundError");
		expect(mapped.message).toBe("Bucket 'test-vault' does not exist.");
	});

	it("maps InvalidAccessKeyId to AuthenticationError with exitCode 3", () => {
		const mapped = S3ErrorMapper.toDomainError(
			{
				name: "InvalidAccessKeyId",
				message:
					"The AWS Access Key Id you provided does not exist in our records.",
			},
			{ bucket: "b1" },
		);

		expect(mapped.name).toBe("AuthenticationError");
		expect(mapped.exitCode).toBe(3);
	});
});

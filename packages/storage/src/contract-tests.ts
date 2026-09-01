import { ChecksumUtils } from "@S3-vault-CLI/domain";
import { beforeEach, describe, expect, it } from "bun:test";
import type { StorageBackend } from "./types.js";
import { StreamUtils } from "./utils.js";

export function runStorageContractTests(
	backendName: string,
	createBackend: () => Promise<StorageBackend>,
	bucketName = "test-vault-bucket",
) {
	describe(`StorageBackend Contract: [${backendName}]`, () => {
		let backend: StorageBackend;

		beforeEach(async () => {
			backend = await createBackend();
		});

		it("puts and gets an object with metadata and checksum", async () => {
			const content = "Hello S3 Vault Storage Backend Contract Test!";
			const sha256 = ChecksumUtils.sha256(content);

			const putRes = await backend.putObject({
				bucket: bucketName,
				key: "test-dir/sample.txt",
				body: content,
				contentType: "text/plain",
				checksumSha256: sha256,
				userMetadata: { "vault-created-by": "contract-test" },
			});

			expect(putRes.etag).toBeDefined();

			const head = await backend.headObject({
				bucket: bucketName,
				key: "test-dir/sample.txt",
			});

			expect(head).not.toBeNull();
			expect(head?.key).toBe("test-dir/sample.txt");
			expect(head?.size).toBe(Buffer.byteLength(content));
			expect(head?.contentType).toBe("text/plain");

			const stream = await backend.getObject({
				bucket: bucketName,
				key: "test-dir/sample.txt",
			});

			const retrievedBuf = await StreamUtils.toBuffer(stream);
			expect(retrievedBuf.toString("utf-8")).toBe(content);
		});

		it("lists objects with prefix filtering", async () => {
			await backend.putObject({
				bucket: bucketName,
				key: "prefix1/file1.txt",
				body: "content1",
			});
			await backend.putObject({
				bucket: bucketName,
				key: "prefix1/file2.txt",
				body: "content2",
			});
			await backend.putObject({
				bucket: bucketName,
				key: "prefix2/file3.txt",
				body: "content3",
			});

			const prefix1Objects: string[] = [];
			for await (const obj of backend.listObjects({
				bucket: bucketName,
				prefix: "prefix1/",
			})) {
				prefix1Objects.push(obj.key);
			}

			expect(prefix1Objects.length).toBe(2);
			expect(prefix1Objects).toContain("prefix1/file1.txt");
			expect(prefix1Objects).toContain("prefix1/file2.txt");
		});

		it("deletes an object properly", async () => {
			await backend.putObject({
				bucket: bucketName,
				key: "to-delete.txt",
				body: "delete me",
			});

			const beforeDelete = await backend.headObject({
				bucket: bucketName,
				key: "to-delete.txt",
			});
			expect(beforeDelete).not.toBeNull();

			await backend.deleteObject({
				bucket: bucketName,
				key: "to-delete.txt",
			});

			const afterDelete = await backend.headObject({
				bucket: bucketName,
				key: "to-delete.txt",
			});
			expect(afterDelete).toBeNull();
		});

		if (backendName !== "mock-basic") {
			it("supports multipart upload workflow", async () => {
				const key = "large-multipart-file.bin";
				const part1Content = "Part 1 of the multipart upload chunk...";
				const part2Content = "Part 2 of the multipart upload chunk...";

				const { uploadId } = await backend.createMultipartUpload({
					bucket: bucketName,
					key,
					contentType: "application/octet-stream",
				});

				expect(uploadId).toBeDefined();

				const p1 = await backend.uploadPart({
					bucket: bucketName,
					key,
					uploadId,
					partNumber: 1,
					body: part1Content,
					size: Buffer.byteLength(part1Content),
				});

				const p2 = await backend.uploadPart({
					bucket: bucketName,
					key,
					uploadId,
					partNumber: 2,
					body: part2Content,
					size: Buffer.byteLength(part2Content),
				});

				expect(p1.etag).toBeDefined();
				expect(p2.etag).toBeDefined();

				const completeRes = await backend.completeMultipartUpload({
					bucket: bucketName,
					key,
					uploadId,
					parts: [p1, p2],
				});

				expect(completeRes.etag).toBeDefined();

				const stream = await backend.getObject({ bucket: bucketName, key });
				const finalBuf = await StreamUtils.toBuffer(stream);
				expect(finalBuf.toString("utf-8")).toBe(part1Content + part2Content);
			});
		}

		it("checks backend health", async () => {
			const health = await backend.checkHealth(bucketName);
			expect(health.ok).toBe(true);
			expect(health.bucketExists).toBe(true);
		});
	});
}

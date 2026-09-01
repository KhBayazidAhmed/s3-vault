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
import {
	createReadStream,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Readable } from "node:stream";

export class LocalFileSystemStorageBackend implements StorageBackend {
	readonly name = "local-filesystem-mock";
	readonly capabilities: StorageCapabilities = {
		supportsMultipart: true,
		supportsPresigning: true,
		supportsChecksumSha256: true,
		supportsVersioning: false,
		supportsByteRanges: true,
	};

	private rootDir: string;
	private multipartTempDir: string;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
		this.multipartTempDir = join(rootDir, ".vault-multipart-temp");
		if (!existsSync(this.rootDir)) {
			mkdirSync(this.rootDir, { recursive: true });
		}
	}

	private getObjectPath(bucket: string, key: string): string {
		return join(this.rootDir, bucket, key);
	}

	private getMetaPath(bucket: string, key: string): string {
		return join(this.rootDir, bucket, `${key}.meta.json`);
	}

	async headObject(input: HeadObjectInput): Promise<ObjectMetadata | null> {
		const filePath = this.getObjectPath(input.bucket, input.key);
		const metaPath = this.getMetaPath(input.bucket, input.key);

		if (!existsSync(filePath)) return null;

		const stats = statSync(filePath);
		let meta: Partial<ObjectMetadata> = {};
		if (existsSync(metaPath)) {
			try {
				meta = JSON.parse(readFileSync(metaPath, "utf-8"));
			} catch {}
		}

		return {
			key: input.key,
			size: stats.size,
			lastModified: stats.mtime,
			etag: meta.etag || `"${ChecksumUtils.md5(readFileSync(filePath))}"`,
			contentType: meta.contentType || "application/octet-stream",
			checksumSha256: meta.checksumSha256,
			storageClass: meta.storageClass || "STANDARD",
			userMetadata: meta.userMetadata,
		};
	}

	async getObject(input: GetObjectInput): Promise<Readable> {
		const filePath = this.getObjectPath(input.bucket, input.key);
		if (!existsSync(filePath)) {
			throw new NotFoundError(`Object '${input.key}' not found.`);
		}

		if (input.range) {
			const match = input.range.match(/bytes=(\d+)-(\d*)/);
			if (match && match[1]) {
				const start = Number.parseInt(match[1], 10);
				const end = match[2] ? Number.parseInt(match[2], 10) : undefined;
				return createReadStream(filePath, { start, end });
			}
		}

		return createReadStream(filePath);
	}

	async putObject(input: PutObjectInput): Promise<PutObjectResult> {
		const filePath = this.getObjectPath(input.bucket, input.key);
		const metaPath = this.getMetaPath(input.bucket, input.key);

		mkdirSync(dirname(filePath), { recursive: true });

		const buf = await StreamUtils.toBuffer(input.body);
		writeFileSync(filePath, buf);

		const md5 = ChecksumUtils.md5(buf);
		const sha256 = input.checksumSha256 ?? ChecksumUtils.sha256(buf);
		const etag = `"${md5}"`;

		const meta: ObjectMetadata = {
			key: input.key,
			size: buf.length,
			lastModified: new Date(),
			etag,
			contentType: input.contentType ?? "application/octet-stream",
			checksumSha256: sha256,
			storageClass: input.storageClass ?? "STANDARD",
			userMetadata: input.userMetadata,
		};

		writeFileSync(metaPath, JSON.stringify(meta, null, 2));

		return { etag, checksumSha256: sha256 };
	}

	async *listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata> {
		const bucketDir = join(this.rootDir, input.bucket);
		if (!existsSync(bucketDir)) return;

		const prefix = input.prefix ?? "";

		const walk = function* (dir: string): Generator<string> {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!entry.name.startsWith(".")) {
						yield* walk(full);
					}
				} else if (!entry.name.endsWith(".meta.json")) {
					yield full;
				}
			}
		};

		for (const fullPath of walk(bucketDir)) {
			const relKey = relative(bucketDir, fullPath).replace(/\\/g, "/");
			if (relKey.startsWith(prefix)) {
				const head = await this.headObject({
					bucket: input.bucket,
					key: relKey,
				});
				if (head) yield head;
			}
		}
	}

	async deleteObject(input: DeleteObjectInput): Promise<void> {
		const filePath = this.getObjectPath(input.bucket, input.key);
		const metaPath = this.getMetaPath(input.bucket, input.key);

		if (existsSync(filePath)) unlinkSync(filePath);
		if (existsSync(metaPath)) unlinkSync(metaPath);
	}

	async createMultipartUpload(
		input: MultipartInput,
	): Promise<{ uploadId: string }> {
		const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const sessionDir = join(this.multipartTempDir, uploadId);
		mkdirSync(sessionDir, { recursive: true });

		writeFileSync(join(sessionDir, "meta.json"), JSON.stringify(input));

		return { uploadId };
	}

	async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
		const sessionDir = join(this.multipartTempDir, input.uploadId);
		if (!existsSync(sessionDir)) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		const partPath = join(sessionDir, `part-${input.partNumber}`);
		const buf = await StreamUtils.toBuffer(input.body);
		writeFileSync(partPath, buf);

		const md5 = ChecksumUtils.md5(buf);
		const etag = `"${md5}"`;
		const sha256 = input.checksumSha256 ?? ChecksumUtils.sha256(buf);

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
		const sessionDir = join(this.multipartTempDir, input.uploadId);
		if (!existsSync(sessionDir)) {
			throw new NotFoundError(
				`Multipart upload session '${input.uploadId}' not found.`,
			);
		}

		const sortedParts = [...input.parts].sort(
			(a, b) => a.partNumber - b.partNumber,
		);
		const partBuffers: Buffer[] = [];
		const partMd5s: string[] = [];

		for (const part of sortedParts) {
			const partPath = join(sessionDir, `part-${part.partNumber}`);
			if (!existsSync(partPath)) {
				throw new NotFoundError(`Part ${part.partNumber} not found.`);
			}
			const pBuf = readFileSync(partPath);
			partBuffers.push(pBuf);
			partMd5s.push(part.etag.replace(/["']/g, ""));
		}

		const combined = Buffer.concat(partBuffers);
		const multiEtag = `"${ChecksumUtils.computeMultipartETag(partMd5s)}"`;
		const sha256 = ChecksumUtils.sha256(combined);

		await this.putObject({
			bucket: input.bucket,
			key: input.key,
			body: combined,
			checksumSha256: sha256,
		});

		return { etag: multiEtag, checksumSha256: sha256 };
	}

	async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
		const sessionDir = join(this.multipartTempDir, input.uploadId);
		if (existsSync(sessionDir)) {
			// Clean up session directory
			const files = readdirSync(sessionDir);
			for (const file of files) {
				unlinkSync(join(sessionDir, file));
			}
		}
	}

	async createPresignedUrl(input: PresignInput): Promise<string> {
		return `file://${this.getObjectPath(input.bucket, input.key)}`;
	}

	async checkHealth(): Promise<HealthCheckResult> {
		return {
			ok: true,
			latencyMs: 1,
			bucketExists: true,
		};
	}
}

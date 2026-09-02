import { ChecksumUtils, type ObjectMetadata } from "@S3-vault-CLI/domain";
import type { MultipartInput } from "@S3-vault-CLI/storage";
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

export class LocalFileStore {
	private readonly multipartTempDir: string;

	constructor(private readonly rootDir: string) {
		this.multipartTempDir = join(rootDir, ".vault-multipart-temp");
		if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true });
	}

	head(bucket: string, key: string): ObjectMetadata | null {
		const filePath = this.objectPath(bucket, key);
		if (!existsSync(filePath)) return null;

		const stats = statSync(filePath);
		const metadata = this.readMetadata(bucket, key);
		return {
			key,
			size: stats.size,
			lastModified: stats.mtime,
			etag: metadata.etag || `"${ChecksumUtils.md5(readFileSync(filePath))}"`,
			contentType: metadata.contentType || "application/octet-stream",
			checksumSha256: metadata.checksumSha256,
			storageClass: metadata.storageClass || "STANDARD",
			userMetadata: metadata.userMetadata,
		};
	}

	open(bucket: string, key: string, range?: string): Readable | null {
		const filePath = this.objectPath(bucket, key);
		if (!existsSync(filePath)) return null;
		const match = range?.match(/bytes=(\d+)-(\d*)/);
		if (match?.[1]) {
			const start = Number.parseInt(match[1], 10);
			const end = match[2] ? Number.parseInt(match[2], 10) : undefined;
			return createReadStream(filePath, { start, end });
		}
		return createReadStream(filePath);
	}

	write(
		bucket: string,
		key: string,
		data: Buffer,
		metadata: ObjectMetadata,
	): void {
		const filePath = this.objectPath(bucket, key);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, data);
		writeFileSync(
			this.metadataPath(bucket, key),
			JSON.stringify(metadata, null, 2),
		);
	}

	*listKeys(bucket: string): Generator<string> {
		const bucketDir = join(this.rootDir, bucket);
		if (!existsSync(bucketDir)) return;
		for (const fullPath of this.walk(bucketDir)) {
			yield relative(bucketDir, fullPath).replace(/\\/g, "/");
		}
	}

	delete(bucket: string, key: string): void {
		const filePath = this.objectPath(bucket, key);
		const metaPath = this.metadataPath(bucket, key);
		if (existsSync(filePath)) unlinkSync(filePath);
		if (existsSync(metaPath)) unlinkSync(metaPath);
	}

	createSession(input: MultipartInput): string {
		const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const sessionDir = this.sessionPath(uploadId);
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(join(sessionDir, "meta.json"), JSON.stringify(input));
		return uploadId;
	}

	hasSession(uploadId: string): boolean {
		return existsSync(this.sessionPath(uploadId));
	}

	writePart(uploadId: string, partNumber: number, data: Buffer): void {
		writeFileSync(this.partPath(uploadId, partNumber), data);
	}

	readPart(uploadId: string, partNumber: number): Buffer | null {
		const path = this.partPath(uploadId, partNumber);
		return existsSync(path) ? readFileSync(path) : null;
	}

	abortSession(uploadId: string): void {
		const sessionDir = this.sessionPath(uploadId);
		if (!existsSync(sessionDir)) return;
		for (const file of readdirSync(sessionDir))
			unlinkSync(join(sessionDir, file));
	}

	objectUrl(bucket: string, key: string): string {
		return `file://${this.objectPath(bucket, key)}`;
	}

	private readMetadata(bucket: string, key: string): Partial<ObjectMetadata> {
		const path = this.metadataPath(bucket, key);
		if (!existsSync(path)) return {};
		try {
			return JSON.parse(readFileSync(path, "utf-8"));
		} catch {
			return {};
		}
	}

	private objectPath(bucket: string, key: string): string {
		return join(this.rootDir, bucket, key);
	}

	private metadataPath(bucket: string, key: string): string {
		return join(this.rootDir, bucket, `${key}.meta.json`);
	}

	private sessionPath(uploadId: string): string {
		return join(this.multipartTempDir, uploadId);
	}

	private partPath(uploadId: string, partNumber: number): string {
		return join(this.sessionPath(uploadId), `part-${partNumber}`);
	}

	private *walk(dir: string): Generator<string> {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory() && !entry.name.startsWith(".")) {
				yield* this.walk(fullPath);
			} else if (!entry.isDirectory() && !entry.name.endsWith(".meta.json")) {
				yield fullPath;
			}
		}
	}
}

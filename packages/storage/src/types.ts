import type { ObjectMetadata, UserMetadata } from "@S3-vault-CLI/domain";
import type { Readable } from "node:stream";

export type StreamData =
	| Readable
	| NodeJS.ReadableStream
	| ReadableStream<Uint8Array>
	| Buffer
	| Uint8Array
	| string;

export interface HeadObjectInput {
	bucket: string;
	key: string;
	versionId?: string;
}

export interface GetObjectInput {
	bucket: string;
	key: string;
	range?: string; // e.g. "bytes=0-1048575"
	versionId?: string;
}

export interface PutObjectInput {
	bucket: string;
	key: string;
	body: StreamData;
	size?: number;
	contentType?: string;
	checksumSha256?: string;
	userMetadata?: UserMetadata;
	storageClass?: string;
}

export interface PutObjectResult {
	etag: string;
	checksumSha256?: string;
	versionId?: string;
}

export interface ListObjectsInput {
	bucket: string;
	prefix?: string;
	delimiter?: string;
	maxKeys?: number;
	continuationToken?: string;
}

export interface DeleteObjectInput {
	bucket: string;
	key: string;
	versionId?: string;
}

export interface MultipartInput {
	bucket: string;
	key: string;
	contentType?: string;
	userMetadata?: UserMetadata;
	storageClass?: string;
}

export interface UploadPartInput {
	bucket: string;
	key: string;
	uploadId: string;
	partNumber: number;
	body: StreamData;
	size: number;
	checksumSha256?: string;
}

export interface UploadedPart {
	partNumber: number;
	etag: string;
	checksumSha256?: string;
	size: number;
}

export interface CompleteMultipartInput {
	bucket: string;
	key: string;
	uploadId: string;
	parts: { partNumber: number; etag: string; checksumSha256?: string }[];
}

export interface AbortMultipartInput {
	bucket: string;
	key: string;
	uploadId: string;
}

export interface PresignInput {
	bucket: string;
	key: string;
	method: "GET" | "PUT";
	expiresInSeconds?: number;
}

export interface StorageCapabilities {
	supportsMultipart: boolean;
	supportsPresigning: boolean;
	supportsChecksumSha256: boolean;
	supportsVersioning: boolean;
	supportsByteRanges: boolean;
}

export interface HealthCheckResult {
	ok: boolean;
	latencyMs: number;
	bucketExists: boolean;
	error?: string;
}

export interface StorageBackend {
	readonly name: string;
	readonly capabilities: StorageCapabilities;

	headObject(input: HeadObjectInput): Promise<ObjectMetadata | null>;
	getObject(input: GetObjectInput): Promise<Readable>;
	putObject(input: PutObjectInput): Promise<PutObjectResult>;
	listObjects(input: ListObjectsInput): AsyncIterable<ObjectMetadata>;
	deleteObject(input: DeleteObjectInput): Promise<void>;

	createMultipartUpload(input: MultipartInput): Promise<{ uploadId: string }>;
	uploadPart(input: UploadPartInput): Promise<UploadedPart>;
	completeMultipartUpload(
		input: CompleteMultipartInput,
	): Promise<PutObjectResult>;
	abortMultipartUpload(input: AbortMultipartInput): Promise<void>;

	createPresignedUrl(input: PresignInput): Promise<string>;
	checkHealth(bucket: string): Promise<HealthCheckResult>;
}

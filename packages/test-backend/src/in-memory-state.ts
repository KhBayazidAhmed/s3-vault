import type { ObjectMetadata, UserMetadata } from "@S3-vault-CLI/domain";

interface StoredObject {
	data: Buffer;
	metadata: ObjectMetadata;
}

export interface StoredPart {
	data: Buffer;
	etag: string;
	checksumSha256?: string;
	size: number;
}

export interface InFlightMultipart {
	bucket: string;
	key: string;
	contentType?: string;
	userMetadata?: UserMetadata;
	storageClass?: string;
	parts: Map<number, StoredPart>;
}

export interface InjectedFailure {
	operation:
		| "putObject"
		| "getObject"
		| "uploadPart"
		| "listObjects"
		| "headObject";
	keyPattern?: RegExp;
	partNumber?: number;
	timesRemaining: number;
	error: Error;
}

export class FailureInjector {
	private rules: InjectedFailure[] = [];

	inject(rule: InjectedFailure): void {
		this.rules.push(rule);
	}

	clear(): void {
		this.rules = [];
	}

	check(
		operation: InjectedFailure["operation"],
		key?: string,
		partNumber?: number,
	): void {
		for (const rule of this.rules) {
			if (rule.timesRemaining <= 0 || rule.operation !== operation) continue;
			if (rule.keyPattern && key && !rule.keyPattern.test(key)) continue;
			if (
				rule.partNumber !== undefined &&
				partNumber !== undefined &&
				rule.partNumber !== partNumber
			) {
				continue;
			}
			rule.timesRemaining--;
			throw rule.error;
		}
	}
}

export class InMemoryObjectStore {
	private readonly objects = new Map<string, StoredObject>();

	get(bucket: string, key: string): StoredObject | undefined {
		return this.objects.get(this.makeKey(bucket, key));
	}

	set(bucket: string, key: string, object: StoredObject): void {
		this.objects.set(this.makeKey(bucket, key), object);
	}

	delete(bucket: string, key: string): void {
		this.objects.delete(this.makeKey(bucket, key));
	}

	*list(bucket: string, prefix: string): Generator<ObjectMetadata> {
		const bucketPrefix = `${bucket}:::`;
		for (const [key, item] of this.objects.entries()) {
			if (!key.startsWith(bucketPrefix)) continue;
			const objectKey = key.slice(bucketPrefix.length);
			if (objectKey.startsWith(prefix)) yield { ...item.metadata };
		}
	}

	private makeKey(bucket: string, key: string): string {
		return `${bucket}:::${key}`;
	}
}

export class MultipartSessionStore {
	private readonly sessions = new Map<string, InFlightMultipart>();

	create(session: Omit<InFlightMultipart, "parts">): string {
		const uploadId = `mock-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.sessions.set(uploadId, { ...session, parts: new Map() });
		return uploadId;
	}

	get(uploadId: string): InFlightMultipart | undefined {
		return this.sessions.get(uploadId);
	}

	delete(uploadId: string): void {
		this.sessions.delete(uploadId);
	}
}

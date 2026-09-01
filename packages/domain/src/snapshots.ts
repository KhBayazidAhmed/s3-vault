export interface SnapshotEntry {
	path: string;
	size: number;
	lastModified: string;
	etag: string;
	checksumSha256?: string;
	storageClass?: string;
	contentType?: string;
	metadata?: Record<string, string>;
}

export interface SnapshotManifest {
	schemaVersion: "v1";
	id: string;
	profileName: string;
	bucket: string;
	prefix?: string;
	createdAt: string;
	rootChecksumSha256: string;
	totalObjects: number;
	totalSizeBytes: number;
	entries: SnapshotEntry[];
}

export interface SnapshotDiff {
	snapshotAId: string;
	snapshotBId: string;
	added: SnapshotEntry[];
	removed: SnapshotEntry[];
	modified: {
		path: string;
		before: SnapshotEntry;
		after: SnapshotEntry;
		sizeDelta: number;
	}[];
	unchangedCount: number;
	totalSizeDelta: number;
}

export interface UserMetadata {
	[key: string]: string;
}

export interface VaultObject {
	key: string;
	size: number;
	lastModified: Date;
	etag: string;
	contentType?: string;
	checksumSha256?: string;
	storageClass?: string;
	userMetadata?: UserMetadata;
	versionId?: string;
	isPrefix?: boolean;
}

export interface ObjectMetadata {
	key: string;
	size: number;
	lastModified: Date;
	etag: string;
	contentType?: string;
	checksumSha256?: string;
	storageClass?: string;
	userMetadata?: UserMetadata;
	versionId?: string;
}

export interface ObjectListing {
	objects: VaultObject[];
	commonPrefixes: string[];
	nextContinuationToken?: string;
	isTruncated: boolean;
}

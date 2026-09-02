export type LocalUploadStatus =
	| "new"
	| "uploaded"
	| "changed"
	| "renamed"
	| "remote-missing"
	| "remote-changed"
	| "checking";

export interface UploadedFileRecord {
	id: string;
	profileName: string;
	bucket: string;
	remoteKey: string;
	localPath: string;
	localName: string;
	fileSize: number;
	localMtimeMs: number;
	localSha256: string;
	deviceId?: number;
	inode?: number;
	remoteEtag?: string;
	remoteChecksumSha256?: string;
	uploadedAt: Date;
	remoteVerifiedAt?: Date;
}

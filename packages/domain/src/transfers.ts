export type TransferDirection =
	| "push"
	| "pull"
	| "sync-up"
	| "sync-down"
	| "sync-two-way";

export type ConflictPolicy =
	| "ask"
	| "newer"
	| "local-wins"
	| "remote-wins"
	| "fail"
	| "skip";

export type DeletePolicy = "none" | "delete" | "delete-excluded";

export type TransferStatus =
	| "pending"
	| "planning"
	| "in_progress"
	| "completed"
	| "failed"
	| "cancelled"
	| "paused";

export type TransferAction =
	| "upload"
	| "download"
	| "delete-local"
	| "delete-remote"
	| "skip"
	| "conflict";

export interface TransferItem {
	id: string;
	sourcePath: string;
	targetPath: string;
	relativePath: string;
	size: number;
	action: TransferAction;
	reason?: string;
	localLastModified?: Date;
	remoteLastModified?: Date;
	localHash?: string;
	remoteHash?: string;
	status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
	bytesTransferred: number;
	error?: string;
}

export interface TransferPlan {
	direction: TransferDirection;
	items: TransferItem[];
	totalCount: number;
	totalBytes: number;
	additions: number;
	updates: number;
	deletions: number;
	conflicts: number;
	skips: number;
}

export interface TransferProgress {
	jobId: string;
	totalFiles: number;
	completedFiles: number;
	failedFiles: number;
	totalBytes: number;
	transferredBytes: number;
	speedBytesPerSec: number;
	estimatedRemainingSec: number;
	activeItem?: string;
	status: TransferStatus;
}

export interface TransferJob {
	id: string;
	profileName: string;
	direction: TransferDirection;
	sourcePath: string;
	targetPath: string;
	totalItems: number;
	totalBytes: number;
	status: TransferStatus;
	createdAt: Date;
	updatedAt: Date;
	completedAt?: Date;
	errorMessage?: string;
}

export interface MultipartSession {
	uploadId: string;
	bucket: string;
	key: string;
	partSize: number;
	totalParts: number;
	totalBytes: number;
	completedParts: {
		partNumber: number;
		etag: string;
		checksumSha256?: string;
	}[];
	createdAt: Date;
}

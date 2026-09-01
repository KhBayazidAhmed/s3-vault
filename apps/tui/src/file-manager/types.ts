export interface FileItem {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	modifiedAt?: string;
	etag?: string;
}

export type PaneType = "local" | "remote";

export type ModalType =
	| "none"
	| "profile-select"
	| "profile-create"
	| "confirm-delete"
	| "share-link"
	| "help";

export interface TransferProgressState {
	active: boolean;
	label: string;
	transferredBytes: number;
	totalBytes: number;
	percentage: number;
}

export interface ProfileSummary {
	name: string;
	provider: string;
	bucket: string;
	region?: string;
	isActive: boolean;
	isDefault: boolean;
}

export interface TuiState {
	activePane: PaneType;
	localPath: string;
	localItems: FileItem[];
	localCursor: number;
	localScrollOffset: number;

	remotePrefix: string;
	remoteItems: FileItem[];
	remoteCursor: number;
	remoteScrollOffset: number;

	activeProfileName?: string;
	activeBucket?: string;
	provider?: string;
	statusOk: boolean;
	latencyMs: number;

	availableProfiles: ProfileSummary[];
	activeModal: ModalType;
	modalCursor: number;
	modalInput: string;
	modalStep: number;
	modalData: Record<string, any>;

	statusMessage: string;
	statusType: "info" | "success" | "error" | "warning";
	progress: TransferProgressState;
	isLoading: boolean;
}

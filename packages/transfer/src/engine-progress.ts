import type { TransferProgress } from "@S3-vault-CLI/domain";

export interface ProgressState {
	completedFiles: number;
	failedFiles: number;
	transferredBytes: number;
}

export function createProgressEmitter(
	jobId: string,
	totalFiles: number,
	totalBytes: number,
	state: ProgressState,
	emit: (progress: TransferProgress) => void,
): (activeItem?: string) => void {
	const startTime = Date.now();
	return (activeItem?: string) => {
		const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
		const speedBytesPerSec = state.transferredBytes / elapsedSec;
		const remainingBytes = Math.max(0, totalBytes - state.transferredBytes);
		emit({
			jobId,
			totalFiles,
			completedFiles: state.completedFiles,
			failedFiles: state.failedFiles,
			totalBytes,
			transferredBytes: state.transferredBytes,
			speedBytesPerSec,
			estimatedRemainingSec:
				speedBytesPerSec > 0 ? remainingBytes / speedBytesPerSec : 0,
			activeItem,
			status:
				state.failedFiles > 0 && state.completedFiles === 0
					? "failed"
					: "in_progress",
		});
	};
}

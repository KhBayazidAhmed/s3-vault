import type { TransferJob } from "@S3-vault-CLI/domain";
import type { TransferHistoryFilter } from "@S3-vault-CLI/state";
import type { ServiceContext } from "../service-context.js";

export class HistoryUseCase {
	constructor(private context: ServiceContext) {}

	execute(filter: TransferHistoryFilter = {}): TransferJob[] {
		return this.context.transferRepo.listHistory(filter);
	}

	getDetails(jobId: string) {
		return this.context.transferRepo.getJob(jobId);
	}
}

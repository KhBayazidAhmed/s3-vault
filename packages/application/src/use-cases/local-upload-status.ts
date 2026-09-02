import {
	ChecksumUtils,
	type LocalUploadStatus,
	type UploadedFileRecord,
} from "@S3-vault-CLI/domain";
import { readFileSync } from "node:fs";
import type { ServiceContext } from "../service-context.js";

export interface LocalFileStatusInput {
	path: string;
	name: string;
	size: number;
	modifiedAtMs?: number;
	deviceId?: number;
	inode?: number;
	isDirectory?: boolean;
}

export interface LocalFileStatusResult {
	status: LocalUploadStatus;
	destination?: string;
	record?: UploadedFileRecord;
}

export class LocalUploadStatusUseCase {
	constructor(private context: ServiceContext) {}

	execute(input: {
		profileName: string;
		bucket: string;
		files: LocalFileStatusInput[];
	}): Map<string, LocalFileStatusResult> {
		const files = input.files.filter(
			(file) => !file.isDirectory && file.name !== "..",
		);
		const records = this.context.uploadedFileRepo.getForLocalPaths(
			input.profileName,
			input.bucket,
			files.map((file) => file.path),
		);
		const recordsByPath = new Map<string, UploadedFileRecord>();
		for (const record of records) recordsByPath.set(record.localPath, record);

		const results = new Map<string, LocalFileStatusResult>();
		for (const file of files) {
			const exactRecord = recordsByPath.get(file.path);
			if (exactRecord) {
				results.set(file.path, this.compareFile(file, exactRecord, false));
				continue;
			}

			const identityRecord =
				file.deviceId !== undefined && file.inode !== undefined
					? this.context.uploadedFileRepo.findByFileIdentity(
							input.profileName,
							input.bucket,
							file.deviceId,
							file.inode,
						)
					: null;

			if (identityRecord) {
				results.set(file.path, this.compareFile(file, identityRecord, true));
			} else {
				results.set(file.path, { status: "new" });
			}
		}

		return results;
	}

	private compareFile(
		file: LocalFileStatusInput,
		record: UploadedFileRecord,
		pathChanged: boolean,
	): LocalFileStatusResult {
		const destination = `s3://${record.bucket}/${record.remoteKey}`;
		if (file.size !== record.fileSize) {
			return { status: "changed", destination, record };
		}

		const mtimeMatches =
			file.modifiedAtMs !== undefined &&
			Math.abs(file.modifiedAtMs - record.localMtimeMs) < 1;
		if (mtimeMatches && !pathChanged && file.name === record.localName) {
			return { status: "uploaded", destination, record };
		}

		try {
			const currentHash = ChecksumUtils.sha256(readFileSync(file.path));
			if (currentHash === record.localSha256) {
				return {
					status:
						pathChanged || file.name !== record.localName
							? "renamed"
							: "uploaded",
					destination,
					record,
				};
			}
			return { status: "changed", destination, record };
		} catch {
			return { status: "new" };
		}
	}
}

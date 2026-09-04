import type { StorageProfileConfig } from "@S3-vault-CLI/config";
import http from "node:http";
import https from "node:https";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export interface ProviderPresetConfig {
	defaultRegion: string;
	forcePathStyle: boolean;
	endpointTemplate?: (options: {
		accountId?: string;
		region?: string;
		endpoint?: string;
	}) => string;
	supportsChecksumSha256: boolean;
}

export const PROVIDER_PRESETS: Record<string, ProviderPresetConfig> = {
	"aws-s3": {
		defaultRegion: "us-east-1",
		forcePathStyle: false,
		supportsChecksumSha256: true,
	},
	"cloudflare-r2": {
		defaultRegion: "auto",
		forcePathStyle: true,
		supportsChecksumSha256: true,
		endpointTemplate: ({ accountId }) =>
			accountId
				? `https://${accountId}.r2.cloudflarestorage.com`
				: "https://auto.r2.cloudflarestorage.com",
	},
	minio: {
		defaultRegion: "us-east-1",
		forcePathStyle: true,
		supportsChecksumSha256: true,
	},
	wasabi: {
		defaultRegion: "us-east-1",
		forcePathStyle: false,
		endpointTemplate: ({ region }) =>
			`https://s3.${region || "us-east-1"}.wasabisys.com`,
		supportsChecksumSha256: true,
	},
	"custom-s3": {
		defaultRegion: "us-east-1",
		forcePathStyle: true,
		supportsChecksumSha256: true,
	},
	mock: {
		defaultRegion: "us-east-1",
		forcePathStyle: true,
		supportsChecksumSha256: true,
	},
};

export function buildS3ClientConfig(
	profile: Partial<StorageProfileConfig>,
	credentials?: {
		accessKeyId: string;
		secretAccessKey: string;
		sessionToken?: string;
	},
): S3ClientConfig {
	const provider = profile.provider || "aws-s3";
	const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS["aws-s3"];

	const region = profile.region || preset?.defaultRegion || "us-east-1";
	let forcePathStyle = preset?.forcePathStyle ?? false;
	if (profile.addressingStyle === "path-style") {
		forcePathStyle = true;
	} else if (profile.addressingStyle === "virtual-hosted") {
		forcePathStyle = false;
	}

	let endpoint = profile.endpoint;
	if (!endpoint && preset?.endpointTemplate) {
		endpoint = preset.endpointTemplate({ region });
	}

	const httpAgent = new http.Agent({
		keepAlive: true,
		maxSockets: 64,
	});
	const httpsAgent = new https.Agent({
		keepAlive: true,
		maxSockets: 64,
	});

	const clientConfig: S3ClientConfig = {
		region,
		forcePathStyle,
		requestHandler: new NodeHttpHandler({
			httpAgent,
			httpsAgent,
			connectionTimeout: 10000,
			requestTimeout: 0,
		}),
	};

	if (endpoint) {
		clientConfig.endpoint = endpoint;
	}

	if (credentials) {
		clientConfig.credentials = {
			accessKeyId: credentials.accessKeyId,
			secretAccessKey: credentials.secretAccessKey,
			sessionToken: credentials.sessionToken,
		};
	}

	return clientConfig;
}

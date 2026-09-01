export interface SecretCredentials {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
}

export interface SecretProvider {
	name: string;
	isAvailable(): Promise<boolean>;
	getCredentials(profileName: string): Promise<SecretCredentials | null>;
	setCredentials(
		profileName: string,
		credentials: SecretCredentials,
	): Promise<void>;
	deleteCredentials(profileName: string): Promise<void>;
}

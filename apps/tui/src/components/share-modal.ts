import { colors } from "@S3-vault-CLI/output";
import { Box, Text } from "@opentui/core";
import type { TuiState } from "../file-manager/types.js";

export function renderShareModal(state: TuiState) {
	if (state.activeModal !== "share-link") return null;

	const url = state.modalData?.url || "Generating presigned URL...";
	const target = state.modalData?.targetItem?.name || "object";

	const lines = [
		`Object: ${colors.bold(target)} (Temporary Link valid for 1 hour)`,
		"",
		`  ${colors.cyan(colors.underline(url))}`,
		"",
		colors.dim("Copy this link to your browser or share with team."),
		colors.bold("Press [Esc] / [Enter] to Close"),
	];

	return Box(
		{
			flexDirection: "column",
			border: true,
			borderStyle: "rounded",
			borderColor: "#10b981",
			title: " 🔗 TEMPORARY SHARE LINK ",
			titleAlignment: "left",
			paddingX: 1,
			marginBottom: 1,
			width: "100%",
		},
		Text({ content: lines.join("\n") }),
	);
}

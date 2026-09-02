import type { CliRenderer } from "@opentui/core";
import { createDualPaneRenderable } from "./dual-pane-renderable.js";

export { formatPaneRows } from "./pane-row-formatting.js";

export function getDualPaneLayout(termWidth: number, termHeight: number) {
	const singlePane = termWidth < 72;
	const paneWidth = singlePane
		? Math.max(18, termWidth - 6)
		: Math.max(24, Math.floor((termWidth - 7) / 2));
	return {
		singlePane,
		paneWidth,
		visibleRows: Math.max(1, termHeight - 14),
	};
}

export function createDualPaneView(renderer: CliRenderer) {
	return createDualPaneRenderable(renderer, getDualPaneLayout);
}

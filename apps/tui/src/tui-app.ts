import type { ServiceContext } from "@S3-vault-CLI/application";
import { BoxRenderable, createCliRenderer } from "@opentui/core";
import { createDualPaneView } from "./components/dual-pane-view.js";
import { createModalView } from "./components/modal-view.js";
import {
	createBottomBarView,
	createHeaderView,
} from "./components/shortcut-bar.js";
import { TuiStateManager } from "./file-manager/tui-state.js";
import { createTuiKeyHandler } from "./tui-key-handler.js";

export async function runInteractiveTui(context: ServiceContext) {
	const renderer = await createCliRenderer({ exitOnCtrlC: true });
	const stateManager = new TuiStateManager(process.cwd());
	const headerView = createHeaderView(renderer);
	const modalView = createModalView(renderer);
	const dualPaneView = createDualPaneView(renderer);
	const bottomBarView = createBottomBarView(renderer);
	const rootBox = new BoxRenderable(renderer, {
		flexDirection: "column",
		flexGrow: 1,
		padding: 1,
		width: "100%",
	});
	rootBox.add(headerView.container);
	rootBox.add(modalView.container);
	rootBox.add(dualPaneView.container);
	rootBox.add(bottomBarView.container);
	renderer.root.add(rootBox);

	const renderApp = () => {
		const state = stateManager.getState();
		headerView.update(state);
		modalView.update(state);
		dualPaneView.update(state);
		bottomBarView.update(state);
		dualPaneView.container.visible = state.activeModal === "none";
	};
	stateManager.subscribe(renderApp);
	process.stdout.on("resize", renderApp);

	stateManager.refreshLocal();
	await stateManager.refreshRemote(context);
	renderApp();
	renderer.keyInput.on(
		"keypress",
		createTuiKeyHandler(renderer, stateManager, context),
	);
}

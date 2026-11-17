// The PWA state: whether the app can be installed, and whether to show the iOS "Add to Home Screen"
// tip. A plain reducer, so it can be tested without a browser.
export type PwaState = {
	canInstall: boolean;
	standalone: boolean;
	ios: boolean;
	showIosTip: boolean;
};

export type PwaEvent =
	| { type: "canInstall" }
	| { type: "installed" }
	| { type: "installDismissed" }
	| { type: "env"; ios: boolean; standalone: boolean };

export type PwaApi = {
	state: PwaState;
	install: () => void;
};

export const START: PwaState = {
	canInstall: false,
	standalone: false,
	ios: false,
	showIosTip: false,
};

export function pwaReducer(s: PwaState, e: PwaEvent): PwaState {
	switch (e.type) {
		case "canInstall":
			return { ...s, canInstall: true };
		case "installed":
			return { ...s, canInstall: false, standalone: true, showIosTip: false };
		case "installDismissed":
			return { ...s, canInstall: false };
		case "env":
			return {
				...s,
				ios: e.ios,
				standalone: e.standalone,
				showIosTip: e.ios && !e.standalone,
			};
	}
}

// The PWA state: whether an update waits, whether the app can be installed, and whether to show the
// iOS "Add to Home Screen" tip. A plain reducer, so it can be tested without a browser.
export type PwaState = {
	needRefresh: boolean;
	canInstall: boolean;
	standalone: boolean;
	ios: boolean;
	showIosTip: boolean;
};

export type PwaEvent =
	| { type: "waiting" }
	| { type: "dismiss" }
	| { type: "canInstall" }
	| { type: "installed" }
	| { type: "installDismissed" }
	| { type: "env"; ios: boolean; standalone: boolean };

export type PwaApi = {
	state: PwaState;
	update: () => void;
	install: () => void;
};

export const START: PwaState = {
	needRefresh: false,
	canInstall: false,
	standalone: false,
	ios: false,
	showIosTip: false,
};

export function pwaReducer(s: PwaState, e: PwaEvent): PwaState {
	switch (e.type) {
		case "waiting":
			return { ...s, needRefresh: true };
		case "dismiss":
			return { ...s, needRefresh: false };
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

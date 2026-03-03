"use client";

import {
	type Dispatch,
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useState,
} from "react";
import type { OverlayChange, StudioTab } from "./types";
import { shouldDefaultPreview } from "./file-icons";

type StudioState = {
	tabs: StudioTab[];
	activeTabId: string | null;
	sidebarOpen: boolean;
	changes: OverlayChange[];
	mountPoint: string;
};

export type StudioAction =
	| { type: "OPEN_FILE"; path: string; name: string }
	| { type: "CLOSE_TAB"; tabId: string }
	| { type: "SET_ACTIVE_TAB"; tabId: string }
	| { type: "TOGGLE_SIDEBAR" }
	| { type: "SET_CHANGES"; changes: OverlayChange[]; mountPoint: string }
	| { type: "TOGGLE_PREVIEW"; tabId: string }
	| { type: "CLOSE_ALL_TABS" }
	| { type: "FILE_WRITTEN"; path: string; name: string };

const initialState: StudioState = {
	tabs: [],
	activeTabId: null,
	sidebarOpen: true,
	changes: [],
	mountPoint: "",
};

function studioReducer(state: StudioState, action: StudioAction): StudioState {
	switch (action.type) {
		case "OPEN_FILE":
		case "FILE_WRITTEN": {
			const existing = state.tabs.find((t) => t.path === action.path);
			if (existing) {
				return { ...state, activeTabId: existing.id };
			}
			const tab: StudioTab = {
				id: action.path,
				path: action.path,
				name: action.name,
				mode: shouldDefaultPreview(action.name) ? "preview" : "code",
			};
			return {
				...state,
				tabs: [...state.tabs, tab],
				activeTabId: tab.id,
			};
		}

		case "CLOSE_TAB": {
			const idx = state.tabs.findIndex((t) => t.id === action.tabId);
			const newTabs = state.tabs.filter((t) => t.id !== action.tabId);
			let newActive = state.activeTabId;
			if (state.activeTabId === action.tabId) {
				if (newTabs.length === 0) {
					newActive = null;
				} else {
					const nextIdx = Math.min(idx, newTabs.length - 1);
					newActive = newTabs[nextIdx].id;
				}
			}
			return { ...state, tabs: newTabs, activeTabId: newActive };
		}

		case "SET_ACTIVE_TAB":
			return { ...state, activeTabId: action.tabId };

		case "TOGGLE_SIDEBAR":
			return { ...state, sidebarOpen: !state.sidebarOpen };

		case "SET_CHANGES":
			return {
				...state,
				changes: action.changes,
				mountPoint: action.mountPoint,
			};

		case "TOGGLE_PREVIEW": {
			return {
				...state,
				tabs: state.tabs.map((t) =>
					t.id === action.tabId
						? { ...t, mode: t.mode === "code" ? "preview" : "code" }
						: t,
				),
			};
		}

		case "CLOSE_ALL_TABS":
			return { ...state, tabs: [], activeTabId: null };

		default:
			return state;
	}
}

const StateContext = createContext<StudioState>(initialState);
const DispatchContext = createContext<Dispatch<StudioAction>>(() => {});
const RefreshContext = createContext<() => void>(() => {});

export function StudioProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(studioReducer, initialState);
	const [loaded, setLoaded] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const res = await fetch("/api/sandbox");
			const data = await res.json();
			if (data.changes) {
				dispatch({ type: "SET_CHANGES", changes: data.changes, mountPoint: data.mountPoint || "" });
			}
		} catch {
			// ignore
		}
		setLoaded(true);
	}, []);

	// Fetch on mount + listen for refresh events
	useEffect(() => {
		refresh();
		const onRefresh = () => refresh();
		const onVisibility = () => { if (!document.hidden) refresh(); };
		window.addEventListener("studio:refresh", onRefresh);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("studio:refresh", onRefresh);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [refresh]);

	// Close all tabs when changes become empty (after clear) — only after initial fetch
	useEffect(() => {
		if (loaded && state.changes.length === 0 && state.tabs.length > 0) {
			dispatch({ type: "CLOSE_ALL_TABS" });
		}
	}, [loaded, state.changes, state.tabs.length]);

	return (
		<StateContext.Provider value={state}>
			<DispatchContext.Provider value={dispatch}>
				<RefreshContext.Provider value={refresh}>
					{children}
				</RefreshContext.Provider>
			</DispatchContext.Provider>
		</StateContext.Provider>
	);
}

export function useStudioState() {
	return useContext(StateContext);
}

export function useStudioDispatch() {
	return useContext(DispatchContext);
}

export function useStudioRefresh() {
	return useContext(RefreshContext);
}

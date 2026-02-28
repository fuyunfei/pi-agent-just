"use client";

import {
	type Dispatch,
	type ReactNode,
	createContext,
	useContext,
	useReducer,
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

export function StudioProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(studioReducer, initialState);
	return (
		<StateContext.Provider value={state}>
			<DispatchContext.Provider value={dispatch}>
				{children}
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

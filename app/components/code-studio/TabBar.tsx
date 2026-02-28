"use client";

import { useRef } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Tab } from "./Tab";

export function TabBar() {
	const { tabs, activeTabId } = useStudioState();
	const dispatch = useStudioDispatch();
	const scrollRef = useRef<HTMLDivElement>(null);

	if (tabs.length === 0) return null;

	return (
		<div
			ref={scrollRef}
			className="flex studio-border-b overflow-x-auto flex-shrink-0 studio-tabbar"
			onWheel={(e) => {
				if (scrollRef.current && e.deltaY !== 0) {
					scrollRef.current.scrollLeft += e.deltaY;
				}
			}}
		>
			{tabs.map((tab) => (
				<Tab
					key={tab.id}
					tab={tab}
					isActive={tab.id === activeTabId}
					onActivate={() =>
						dispatch({ type: "SET_ACTIVE_TAB", tabId: tab.id })
					}
					onClose={() => dispatch({ type: "CLOSE_TAB", tabId: tab.id })}
					onTogglePreview={() =>
						dispatch({ type: "TOGGLE_PREVIEW", tabId: tab.id })
					}
				/>
			))}
		</div>
	);
}

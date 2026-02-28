export type OverlayChange = {
	path: string;
	type: "created" | "modified" | "deleted";
	content?: string;
};

export type StudioTab = {
	id: string;
	path: string;
	name: string;
	mode: "code" | "preview";
};

export type TreeNode = {
	name: string;
	fullPath: string;
	change?: OverlayChange;
	children: TreeNode[];
};

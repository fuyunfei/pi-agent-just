"use client";

import type { BundledLanguage } from "shiki";
import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockHeader,
	CodeBlockTitle,
	CodeBlockFilename,
	CodeBlockActions,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";

export function CodeViewer({
	content,
	language,
	filename,
}: {
	content: string;
	language: string;
	filename?: string;
}) {
	return (
		<CodeBlock
			code={content}
			language={language as BundledLanguage}
			showLineNumbers
			className="h-full rounded-none border-0 flex flex-col [&>.overflow-auto]:flex-1 [&>.overflow-auto]:min-h-0"
		>
			<CodeBlockHeader>
				<CodeBlockTitle>
					<CodeBlockFilename>{filename ?? language}</CodeBlockFilename>
				</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockCopyButton />
				</CodeBlockActions>
			</CodeBlockHeader>
		</CodeBlock>
	);
}

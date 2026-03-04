"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputButton,
} from "@/components/ai-elements/prompt-input";
import {
	Attachments,
	Attachment,
	AttachmentPreview,
	AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import {
	BookOpenIcon,
	BriefcaseIcon,
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	ClapperboardIcon,
	FileEditIcon,
	FileIcon,
	ExternalLinkIcon,
	ImageIcon,
	FilmIcon,
	GraduationCapIcon,
	HeartIcon,
	Loader2Icon,
	MusicIcon,
	PaperclipIcon,
	PlayIcon,
	RocketIcon,
	RotateCcwIcon,
	ShoppingBagIcon,
	SparklesIcon,
	TerminalIcon,
	TrendingUpIcon,
	XCircleIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatAgent } from "./useChatAgent";
import { SlashCommandMenu, useSlashCommandMenu } from "./SlashCommandMenu";
import type { ChatMessage, ModelInfo, ThinkingState, ToolCall } from "./types";
import type { FileUIPart } from "@/components/ai-elements/ai-types";
import { BrainIcon } from "lucide-react";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/app/lib/models";

/* ------------------------------------------------------------------ */
/*  Tool call — compact inline card (V0-style)                        */
/* ------------------------------------------------------------------ */

/** "scene-01-intro.tsx" → "Intro" */
function sceneLabel(filename: string): string {
	const base = filename.replace(/\.(tsx|jsx|ts|js)$/, "");
	const stripped = base.replace(/^scene-\d+-/, "");
	if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
	return base;
}

/** Check if a tool call involves a Remotion scene file */
function isRemotionSceneTool(tool: ToolCall): boolean {
	const name = tool.toolName;
	const hasArgs = Object.keys(tool.args).length > 0;

	// Don't guess during streaming — wait for args to classify correctly
	if (!hasArgs) return false;

	if (name === "write" || name === "writeFile" || name === "createFile") {
		const content = String(tool.args.content || "");
		return /from\s+["']remotion["']/.test(content);
	}
	if (name === "edit" || name === "editFile") {
		const path = String(tool.args.path || tool.args.file_path || "");
		const filename = path.split("/").pop() || "";
		const content = String(tool.args.new_string || tool.args.old_string || "");
		return /from\s+["']remotion["']/.test(content) || /^scene-\d+.*\.(tsx|jsx)$/.test(filename);
	}
	return false;
}

/** Parse duration from @remotion config comment */
function parseSceneDuration(content: string): string | null {
	const match = content.match(/\/\/\s*@remotion\s+fps:(\d+)\s+duration:(\d+)/);
	if (!match) return null;
	const fps = parseInt(match[1]);
	const frames = parseInt(match[2]);
	const sec = Math.floor(frames / fps);
	return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}

interface ToolDisplay {
	icon: React.ReactNode;
	label: string;
	isScene?: boolean;
	isEdit?: boolean;
	sceneDuration?: string | null;
}

/** Friendly tool name for early display (before args arrive) */
const TOOL_LABELS: Record<string, string> = {
	write: "Writing…",
	writeFile: "Writing…",
	createFile: "Creating…",
	edit: "Editing…",
	editFile: "Editing…",
	read: "Reading…",
	readFile: "Reading…",
	grep: "Searching…",
	find: "Finding…",
	ls: "Listing…",
	generate_image: "Generating image…",
};

function toolDisplayInfo(tool: ToolCall): ToolDisplay {
	const name = tool.toolName;
	const args = tool.args;
	const hasArgs = Object.keys(args).length > 0;

	// Early card — no args yet, show generic label (no icon — stateIcon already shows spinner)
	if (!hasArgs) {
		return {
			icon: null,
			label: TOOL_LABELS[name] || name,
		};
	}

	if (name === "bash" || name === "shell" || name === "execute") {
		const cmd = String(args.command || args.cmd || "").split("\n")[0];
		return {
			icon: <TerminalIcon className="size-3.5" />,
			label: cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd,
		};
	}

	if (name === "write" || name === "writeFile" || name === "createFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;

		if (isRemotionSceneTool(tool)) {
			const content = String(args.content || "");
			return {
				icon: <PlayIcon className="size-3 fill-current" />,
				label: short ? sceneLabel(short) : "New scene",
				isScene: true,
				sceneDuration: parseSceneDuration(content),
			};
		}

		return {
			icon: <FileEditIcon className="size-3.5" />,
			label: short || "Writing…",
		};
	}

	if (name === "edit" || name === "editFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;

		if (isRemotionSceneTool(tool)) {
			return {
				icon: <PlayIcon className="size-3 fill-current" />,
				label: short ? sceneLabel(short) : "Updating scene",
				isScene: true,
				isEdit: true,
			};
		}

		return {
			icon: <FileEditIcon className="size-3.5" />,
			label: short ? `edit ${short}` : "Editing…",
		};
	}

	if (name === "read" || name === "readFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;
		return {
			icon: <FileIcon className="size-3.5" />,
			label: short || "Reading…",
		};
	}

	if (name === "generate_image") {
		const prompt = String(args.prompt || "");
		const short = prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
		return {
			icon: <ImageIcon className="size-3.5" />,
			label: short || "Generating image…",
		};
	}

	// Generic
	const argSummary = args.path || args.file_path || args.command || "";
	const label = argSummary
		? `${name} ${String(argSummary).split("/").pop()}`
		: name;
	return {
		icon: <TerminalIcon className="size-3.5" />,
		label: label.length > 60 ? `${label.slice(0, 57)}...` : label,
	};
}

/** Extract filename from tool args */
function toolFilename(tool: ToolCall): string | null {
	const path = String(tool.args.path || tool.args.file_path || "");
	if (!path) return null;
	return path.split("/").pop() || path;
}

const ToolCallCard = memo(function ToolCallCard({ tool }: { tool: ToolCall }) {
	const display = useMemo(() => toolDisplayInfo(tool), [tool]);
	const filename = useMemo(() => toolFilename(tool), [tool]);

	// Can this card open a file?
	const canOpen = tool.state === "completed" && !!filename;

	const handleClick = useCallback(() => {
		if (!canOpen || !filename) return;
		window.dispatchEvent(new CustomEvent("studio:open-scene", { detail: { filename } }));
	}, [canOpen, filename]);

	const handleRetry = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		if (!filename) return;
		window.dispatchEvent(new CustomEvent("studio:retry-scene", {
			detail: { filename, error: tool.output },
		}));
	}, [filename, tool.output]);

	const isError = tool.state === "error";
	const isRunning = tool.state === "running";

	// Scene card — larger, richer styling
	if (display.isScene) {
		return (
			<div className="my-1.5">
				<button
					type="button"
					onClick={handleClick}
					disabled={!canOpen}
					className={cn(
						"flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs text-left transition-colors",
						isRunning
							? "border-border/60 bg-muted/30 cursor-default"
							: isError
								? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
								: canOpen
									? "border-border/60 bg-muted/40 hover:bg-accent/50 hover:border-border cursor-pointer"
									: "border-border/60 bg-muted/40 cursor-default",
					)}
				>
					<div className={cn(
						"flex size-7 items-center justify-center rounded-lg flex-shrink-0 transition-colors",
						isRunning
							? "bg-muted text-muted-foreground"
							: isError
								? "bg-red-500/10 text-red-500"
								: "bg-foreground/5 text-foreground/70",
					)}>
						{isRunning ? (
							<Loader2Icon className="size-3.5 animate-spin" />
						) : isError ? (
							<XCircleIcon className="size-3.5" />
						) : (
							<FilmIcon className="size-3.5" />
						)}
					</div>
					<div className="flex-1 min-w-0">
						<div className={cn("font-medium truncate", isError ? "text-red-500/90" : "text-foreground/90")}>
							{display.label}
						</div>
						<div className="text-[10px] text-muted-foreground/60 mt-0.5">
							{isRunning
								? (display.isEdit ? "Updating scene..." : "Creating scene...")
								: isError
									? "Failed"
									: display.isEdit
										? "Scene updated"
										: display.sceneDuration
											? `Scene · ${display.sceneDuration}`
											: "Scene created"}
						</div>
					</div>
					{isError && (
						<span onClick={handleRetry} className="flex size-6 items-center justify-center rounded-md hover:bg-red-500/10 text-red-500/60 hover:text-red-500 flex-shrink-0 transition-colors" title="Ask AI to fix">
							<RotateCcwIcon className="size-3.5" />
						</span>
					)}
				</button>
			</div>
		);
	}

	// Image generation card — show thumbnail when completed
	if (tool.toolName === "generate_image") {
		const imageUrl = tool.details?.imageUrl as string | undefined;
		return (
			<div className="my-1.5">
				<div className={cn(
					"rounded-xl border overflow-hidden",
					isRunning ? "border-border/60 bg-muted/30" : isError ? "border-red-500/20 bg-red-500/5" : "border-border/60 bg-muted/40",
				)}>
					<div className="flex items-center gap-2 px-3 py-2 text-xs">
						{isRunning ? (
							<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
						) : isError ? (
							<XCircleIcon className="size-3.5 text-red-500" />
						) : (
							<CheckCircle2Icon className="size-3.5 text-emerald-500" />
						)}
						<ImageIcon className="size-3.5 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate text-foreground/80">
							{display.label}
						</span>
					</div>
					{imageUrl && !isRunning && !isError && (
						<div className="px-2 pb-2">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={imageUrl}
								alt={String(tool.args.prompt || "")}
								className="rounded-lg w-full max-h-48 object-cover"
							/>
						</div>
					)}
				</div>
			</div>
		);
	}

	// Default tool card — click opens file if applicable
	const stateIcon = isRunning ? (
		<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
	) : isError ? (
		<XCircleIcon className="size-3.5 text-red-500" />
	) : (
		<CheckCircle2Icon className="size-3.5 text-emerald-500" />
	);

	return (
		<div className="my-1">
			<button
				type="button"
				onClick={handleClick}
				disabled={!canOpen}
				className={cn(
					"flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
					canOpen
						? "bg-muted/40 hover:bg-muted/70 cursor-pointer"
						: "bg-muted/40 cursor-default",
				)}
			>
				{stateIcon}
				<span className="text-muted-foreground">{display.icon}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
					{display.label}
				</span>
				{canOpen && (
					<ExternalLinkIcon className="size-3 text-muted-foreground/30" />
				)}
			</button>
		</div>
	);
});

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Assistant message                                                  */
/* ------------------------------------------------------------------ */

const AssistantMessage = memo(function AssistantMessage({
	msg,
}: { msg: ChatMessage }) {
	const isStreamingEmpty =
		msg.isStreaming && !msg.parts?.length && !msg.content;

	return (
		<div className="flex gap-3">
			{/* Avatar */}
			<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 mt-0.5">
				<SparklesIcon className="size-3.5 text-foreground/60" />
			</div>

			<div className="min-w-0 flex-1 space-y-1">
				{/* Reasoning */}
				{msg.reasoning !== undefined && (
					<Reasoning
						isStreaming={msg.isReasoningStreaming}
						defaultOpen={msg.isReasoningStreaming}
					>
						<ReasoningTrigger />
						<ReasoningContent>{msg.reasoning}</ReasoningContent>
					</Reasoning>
				)}

				{/* Streaming placeholder — dots */}
				{isStreamingEmpty && (
					<div className="flex items-center gap-1 py-2">
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:0ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:200ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:400ms]" />
					</div>
				)}

				{/* Parts — interleaved text + tools */}
				{msg.parts?.map((part, i) =>
					part.type === "tool" ? (
						<ToolCallCard key={part.tool.id} tool={part.tool} />
					) : part.text ? (
						<Message key={`text-${i}`} from="assistant">
							<MessageContent>
								<MessageResponse>{part.text}</MessageResponse>
							</MessageContent>
						</Message>
					) : null,
				)}

				{/* Fallback for messages without parts */}
				{!msg.parts?.length && msg.content && (
					<Message from="assistant">
						<MessageContent>
							<MessageResponse>{msg.content}</MessageResponse>
						</MessageContent>
					</Message>
				)}
			</div>
		</div>
	);
});

/* ------------------------------------------------------------------ */
/*  Suggested prompts                                                  */
/* ------------------------------------------------------------------ */

interface Suggestion {
	icon: typeof SparklesIcon;
	label: string;
	desc: string;
	prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
	{
		icon: BookOpenIcon,
		label: "Philosophy of time",
		desc: "How humans perceive time across history",
		prompt: "An animated essay about the philosophy of time. Scene 1: The ancient Greeks had two words for time — Chronos (clock time, sequential, inevitable) and Kairos (the right moment, qualitative, opportunistic). Show how these two ideas shape everything from religion to productivity culture. Scene 2: Einstein shattered our intuition — time slows near massive objects, speeds up in empty space. Twins age differently. The present moment is an illusion. Scene 3: Digital culture compresses time further. Infinite scroll erases the boundary between past, present, and future. We live in a perpetual now. End with the question: if time is this malleable, what does it mean to spend it well?",
	},
	{
		icon: HeartIcon,
		label: "Art history",
		desc: "Four revolutions that changed how we see",
		prompt: "An animated journey through four turning points in art history. Scene 1: Renaissance — Giotto broke flat medieval painting by adding depth and human emotion. Perspective was invented. For the first time, paintings had a vanishing point and people looked real. Scene 2: Impressionism — Monet, Renoir, and Degas abandoned the studio for outdoor light. Critics mocked them. They painted not what things looked like, but what seeing felt like. Scene 3: Bauhaus — After WWI, artists merged art with industry. Less is more. Grid systems, sans-serif type, functional beauty. Everything from IKEA to iPhone descends from this. Scene 4: Street art — Basquiat, Banksy. Art escaped galleries and went to walls. No permission needed. The most democratic art movement ever.",
	},
	{
		icon: GraduationCapIcon,
		label: "How memory works",
		desc: "Why you remember some things and forget others",
		prompt: "An educational video explaining how human memory actually works. Scene 1: Sensory memory — your brain receives 11 million bits of information per second, but conscious awareness handles only about 50. The rest vanishes in under a second. Scene 2: Short-term memory — the mental workspace that holds about 7 items for 20-30 seconds. This is why phone numbers are 7 digits. Chunking helps: you remember 'FBI-CIA-NASA' better than 9 random letters. Scene 3: Long-term memory — encoded through repetition, emotion, and sleep. Your hippocampus replays the day's events while you dream, strengthening some connections and pruning others. Scene 4: Forgetting — Hermann Ebbinghaus discovered the forgetting curve in 1885. You lose 70% of new information within 24 hours unless you review it. Forgetting isn't a bug — it's how your brain prioritizes what matters.",
	},
	{
		icon: ClapperboardIcon,
		label: "History of cinema",
		desc: "How moving pictures changed the world",
		prompt: "A documentary-style video on the history of cinema. Scene 1: 1895, the Lumière brothers showed a train arriving at a station. Audience members reportedly ducked. Moving pictures were born. Scene 2: 1920s-40s golden age. Charlie Chaplin, then talkies, then Technicolor. Hollywood became a dream factory. Casablanca, Citizen Kane, Gone with the Wind. Scene 3: 1960s New Wave. Godard and Truffaut in France broke every rule — jump cuts, handheld cameras, characters talking to the audience. Cinema became personal. Scene 4: 1970s-90s blockbusters. Spielberg, Lucas, Cameron. Jaws invented the summer blockbuster. Star Wars proved you could build a universe. Terminator 2 showed CGI would change everything. Scene 5: 2010s-now. Netflix, streaming, phones as screens. A Korean film wins Best Picture. A TikTok can be more watched than a Hollywood movie. Cinema is everywhere.",
	},
	{
		icon: MusicIcon,
		label: "Evolution of music",
		desc: "How every genre led to the next",
		prompt: "An animated timeline of how music evolved, each genre rebelling against the last. Scene 1: Classical — Bach, Mozart, Beethoven. Structured, mathematical, performed for royalty. Music as architecture. Scene 2: Jazz — born in New Orleans from African rhythms and blues. Improvisation was the point. Louis Armstrong, Miles Davis, Coltrane. For the first time, the musician mattered more than the composition. Scene 3: Rock & roll — Elvis, Beatles, Hendrix. Electric guitars, rebellion, youth culture. Music became identity. Woodstock proved it could be a movement. Scene 4: Hip-hop — born in the Bronx, 1973. DJ Kool Herc looped breakbeats. Grandmaster Flash, Run-DMC, then Tupac and Biggie. Sampling turned all of music history into raw material. Scene 5: Electronic — Kraftwerk, then house, techno, EDM. Machines became instruments. A laptop became a studio. Skrillex, Daft Punk. Music you feel in your body more than hear with your ears.",
	},
	{
		icon: SparklesIcon,
		label: "The overview effect",
		desc: "What astronauts see that changes them forever",
		prompt: "A contemplative video about the overview effect — the profound cognitive shift astronauts experience when they see Earth from space. Start with everyday human concerns — traffic, deadlines, arguments. Then slowly pull back. Past clouds, past the atmosphere, past the thin blue line that separates life from void. From orbit, there are no borders, no nations, no wars visible. Just a fragile blue marble floating in darkness. Astronaut Ron Garan said: 'When you look down at Earth from space, you don't see boundaries. You see a tiny, fragile ball of life hanging in the void.' End on silence and the whole Earth, small enough to cover with your thumb.",
	},
	{
		icon: TrendingUpIcon,
		label: "Rise and fall of Rome",
		desc: "A thousand years in five chapters",
		prompt: "An animated history of ancient Rome across five chapters. Scene 1: 753 BC, founding myths. Romulus kills Remus and names the city after himself. A small village of shepherds on seven hills. Scene 2: The Republic, 509-27 BC. Rome invents representative government. The Senate, citizen soldiers, roads that still exist. They conquer the Mediterranean and call it 'our sea.' Scene 3: Julius Caesar crosses the Rubicon in 49 BC. Civil war. He becomes dictator. Stabbed 23 times on the Ides of March. His adopted son Octavian becomes Augustus, first emperor. Scene 4: The Empire at its peak, 117 AD under Trajan. 60 million people. Running water, concrete, the Colosseum. The most advanced civilization on Earth. Scene 5: The fall. Overextension, corruption, plague, Germanic invasions. 476 AD, the last western emperor is deposed. A 12-year-old boy named Romulus — the same name as the founder.",
	},
	{
		icon: BriefcaseIcon,
		label: "Future of work",
		desc: "What happens when AI can do your job",
		prompt: "An animated essay about how work is changing. Scene 1: The industrial revolution replaced muscle with machines. Millions left farms for factories. New jobs appeared that no one had imagined — train driver, telephone operator, typist. Scene 2: The knowledge economy. Offices, cubicles, email. Your value was what you knew. MBAs, consultants, PowerPoints. Information was power. Scene 3: AI disruption — now machines replace not just muscle but cognition. GPT writes, Midjourney paints, code copilots program. The jobs we told our kids were safe — lawyer, doctor, accountant — are the most affected. Scene 4: What's left? Creativity, taste, human connection, physical presence. The barista, the therapist, the artist who means it. Maybe the future of work isn't about what AI can't do, but what we choose to do anyway.",
	},
	{
		icon: RocketIcon,
		label: "Pale blue dot",
		desc: "Carl Sagan's humbling message to humanity",
		prompt: "A short video inspired by Carl Sagan's Pale Blue Dot speech. Start on Earth — cities, people, life. Then zoom out. Past the Moon where 12 humans once walked. Past Mars, red and silent. Past Jupiter, a gas giant with a storm bigger than Earth. Past Saturn and its rings of ice. Keep going. Earth shrinks. In 1990, Voyager 1 looked back from 6 billion kilometers and photographed Earth as a pale blue dot suspended in a sunbeam. Sagan wrote: 'Everyone you love, everyone you know, every human being who ever was, lived out their lives on a mote of dust suspended in a sunbeam.'",
	},
	{
		icon: ShoppingBagIcon,
		label: "Psychology of color",
		desc: "Why red means danger and blue means trust",
		prompt: "A video about how colors shape human emotion and behavior. Scene 1: Red — the color of blood and fire. It raises heart rate, creates urgency. Sale signs are red. Stop lights are red. In China it means luck and prosperity; in Western funerals, it's forbidden. Scene 2: Blue — the most universally liked color. It lowers blood pressure and slows breathing. Banks, tech companies, and hospitals all use it. Facebook, Twitter, LinkedIn — all blue. Trust lives here. Scene 3: Yellow — the fastest color for the eye to process. Taxis, warning signs, highlighters. It triggers anxiety in large amounts but joy in small doses. Scene 4: Green — nature, growth, permission. The color your brain finds most restful because our ancestors evolved in green forests. Hospitals paint surgery rooms green. Scene 5: Purple — historically the most expensive dye, reserved for royalty. 10,000 sea snails to make one gram. Today it signals luxury and mystery. Cadbury, Hallmark, Twitch.",
	},
];

/* ------------------------------------------------------------------ */
/*  Usage formatting helpers                                            */
/* ------------------------------------------------------------------ */

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function formatCost(n: number): string {
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Attachment previews in input area                                   */
/* ------------------------------------------------------------------ */

function AttachmentPreviews() {
	const attachments = usePromptInputAttachments();
	if (!attachments.files.length) return null;

	return (
		<div className="px-3 pt-2">
			<Attachments variant="inline">
				{attachments.files.map((file) => (
					<Attachment
						key={file.id}
						data={file}
						onRemove={() => attachments.remove(file.id)}
					>
						<AttachmentPreview />
						<AttachmentRemove />
					</Attachment>
				))}
			</Attachments>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Auto-scroll when new messages arrive                               */
/* ------------------------------------------------------------------ */

function ScrollOnNewMessage({ count }: { count: number }) {
	const { scrollToBottom } = useStickToBottomContext();
	const prev = useRef(count);
	useEffect(() => {
		if (count > prev.current) scrollToBottom();
		prev.current = count;
	}, [count, scrollToBottom]);
	return null;
}

/* ------------------------------------------------------------------ */
/*  Model selector                                                     */
/* ------------------------------------------------------------------ */

const THINKING_LABELS: Record<string, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Max",
};

function ModelSelector({ models, current, onSwitch, thinking, onSwitchThinking }: {
	models: ModelInfo[];
	current: ModelInfo | null;
	onSwitch: (provider: string, id: string) => void;
	thinking: ThinkingState;
	onSwitchThinking: (level: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const active = current || DEFAULT_MODEL;
	const isSelected = (m: ModelInfo) => m.id === active.id && m.provider === active.provider;
	const showThinking = thinking.supported && thinking.available.length > 1;
	const thinkingOn = showThinking && thinking.level !== "off";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-all duration-150",
						open
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent/70",
					)}
				>
					<span className="truncate max-w-[160px]">{active.label}</span>
					{thinkingOn && (
						<span className="flex items-center gap-1 text-brand-clay/60">
							<span className="text-[9px]">·</span>
							<BrainIcon className="size-3" />
						</span>
					)}
					<ChevronDownIcon className={cn(
						"size-3 opacity-40 transition-transform duration-200",
						open && "rotate-180",
					)} />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-1" sideOffset={8}>
				{models.map((m) => {
					const selected = isSelected(m);
					return (
						<button
							key={`${m.provider}/${m.id}`}
							type="button"
							onClick={() => { onSwitch(m.provider, m.id); setOpen(false); }}
							className={cn(
								"group/item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left transition-all duration-150",
								selected
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground active:bg-accent/80",
							)}
						>
							<span className={cn(
								"size-1.5 rounded-full flex-shrink-0 transition-all duration-150",
								selected
									? "bg-brand-moss shadow-[0_0_4px_var(--brand-moss)]"
									: "bg-muted-foreground/15 group-hover/item:bg-muted-foreground/30",
							)} />
							<span className={cn("flex-1 truncate", selected && "text-brand-moss")}>{m.label}</span>
							<span className={cn(
								"text-[10px] transition-colors duration-150",
								selected ? "text-muted-foreground/50" : "text-muted-foreground/25 group-hover/item:text-muted-foreground/45",
							)}>{m.desc}</span>
						</button>
					);
				})}
				{showThinking && (
					<>
						<div className="mx-2.5 my-1 border-t border-border/20" />
						<div className="px-2.5 pt-1 pb-1.5 flex items-center justify-between">
							<span className="text-[10px] text-muted-foreground/35 flex items-center gap-1">
								<BrainIcon className="size-2.5" />
								Thinking
							</span>
						</div>
						<div className="mx-1.5 mb-1.5 grid grid-cols-3 gap-0.5 rounded-lg bg-muted/50 p-0.5">
							{thinking.available.map((level) => {
								const selected = level === thinking.level;
								return (
									<button
										key={level}
										type="button"
										onClick={() => onSwitchThinking(level)}
										className={cn(
											"rounded-md py-1.5 text-[11px] text-center transition-all duration-150",
											selected
												? "bg-background text-brand-clay shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
												: "text-muted-foreground/40 hover:text-muted-foreground active:text-foreground",
										)}
									>
										{THINKING_LABELS[level] || level}
									</button>
								);
							})}
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

/* ------------------------------------------------------------------ */
/*  ChatPanel                                                          */
/* ------------------------------------------------------------------ */

export function ChatPanel() {
	const { messages, status, send, stop, clear, currentModel, switchModel, thinking, switchThinkingLevel, usage } = useChatAgent();
	const [confirmClear, setConfirmClear] = useState(false);
	const clearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const handleClear = useCallback(() => {
		if (!confirmClear) {
			setConfirmClear(true);
			clearTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
			return;
		}
		clearTimeout(clearTimerRef.current);
		setConfirmClear(false);
		clear();
	}, [confirmClear, clear]);

	useEffect(() => {
		return () => clearTimeout(clearTimerRef.current);
	}, []);

	// Listen for retry-scene from error scene cards
	useEffect(() => {
		const handler = (e: Event) => {
			const { filename, error, type } = (e as CustomEvent).detail || {};
			if (filename && error) {
				const sceneLabel = filename.replace(/\.(tsx|jsx|ts|js)$/, "").replace(/^scene-\d+-/, "");
				const friendlyName = sceneLabel ? sceneLabel.charAt(0).toUpperCase() + sceneLabel.slice(1) : filename;
				const prefix = type === "runtime"
					? `${filename} throws a runtime error when playing. Read the file, find the bug, and fix it with the edit tool.`
					: `${filename} has a compilation error and cannot render. Read the file, find the syntax issue, and fix it with the edit tool.`;
				const fullText = `${prefix}\n\nError:\n${error}`;
				const displayText = `Fix "${friendlyName}"`;
				send(fullText, undefined, displayText);
			}
		};
		window.addEventListener("studio:retry-scene", handler);
		return () => window.removeEventListener("studio:retry-scene", handler);
	}, [send]);

	const slashMenu = useSlashCommandMenu(send, {
		models: AVAILABLE_MODELS,
		currentModel,
		onSwitchModel: switchModel,
	});

	const handleSubmit = useCallback(
		({ text, files }: { text: string; files?: FileUIPart[] }) => {
			if (!text.trim() || status === "submitted" || status === "streaming") return;
			slashMenu.setQuery("");
			send(text.trim(), files?.length ? files : undefined);
		},
		[send, slashMenu, status],
	);

	const chatStatus =
		status === "submitted"
			? "submitted"
			: status === "streaming"
				? "streaming"
				: status === "error"
					? "error"
					: "ready";

	// Pick 4 random suggestions (stable per mount)
	const visibleSuggestions = useMemo(() => {
		const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5);
		return shuffled.slice(0, 4);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="flex flex-col h-full" style={{ background: "#FAFAF8" }}>
			<Conversation className="flex-1 relative chat-scroll">
				<ScrollOnNewMessage count={messages.length} />
				<ConversationContent className="gap-6 px-4 py-6">
					{/* Empty state */}
					{messages.length === 0 && (
						<div className="flex flex-col items-center justify-center h-full text-center px-6">
							<div className="flex flex-col items-center gap-12 max-w-md w-full">
								{/* Brand identity */}
								<div className="flex flex-col items-center gap-6">
	{/* No logo in chat sidebar */}
									<div className="space-y-3">
										<h1 className="text-xl tracking-tight" style={{ fontFamily: "'Noto Serif', serif", color: "#282828", fontWeight: 500 }}>
											What story do you want to tell?
										</h1>
										<p className="text-[13px] leading-relaxed" style={{ color: "#7A766D" }}>
											Describe your video — I&apos;ll bring it to life.
										</p>
									</div>
								</div>
								{/* Suggestion cards */}
								<div className="grid grid-cols-2 gap-3 w-full">
									{visibleSuggestions.map((s) => (
										<button
											key={s.label}
											type="button"
											onClick={() => send(s.prompt)}
											className="flex flex-col items-start gap-3 p-4 rounded-xl text-left transition-all duration-200 group active:scale-[0.98]"
											style={{
												background: "#FFFFFF",
												border: "1px solid #E8E7E3",
												boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.borderColor = "#D6D4CE";
												e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)";
												e.currentTarget.style.transform = "translateY(-1px)";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.borderColor = "#E8E7E3";
												e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)";
												e.currentTarget.style.transform = "translateY(0)";
											}}
										>
											<s.icon style={{ color: "#C07F5E" }} className="size-[18px] opacity-70 group-hover:opacity-100 transition-opacity duration-200" strokeWidth={1.5} />
											<div className="space-y-1">
												<span className="text-[13px] font-medium block" style={{ color: "#282828" }}>{s.label}</span>
												<span className="text-[11px] leading-[1.5] block" style={{ color: "#A8A49C" }}>{s.desc}</span>
											</div>
										</button>
									))}
								</div>
							</div>
						</div>
					)}

					{messages.map((msg) => (
						<div key={msg.id}>
							{msg.role === "system" ? (
									<div className="flex justify-center px-10">
										<pre className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-4 py-2 font-mono whitespace-pre-wrap max-w-full">
											{msg.content}
										</pre>
									</div>
								) : msg.role === "user" ? (
									<Message from="user">
										<MessageContent>{msg.content}</MessageContent>
									</Message>
								) : (
									<AssistantMessage msg={msg} />
								)}
							</div>
					))}
				</ConversationContent>
				<ConversationScrollButton />
				{/* Floating new session button — top left */}
				{messages.length > 0 && (
					<button
						type="button"
						onClick={handleClear}
						className={cn(
							"absolute top-2 left-3 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-all",
							confirmClear
								? "bg-destructive/10 text-destructive border border-destructive/20"
								: "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
						)}
					>
						<RotateCcwIcon className={cn("size-3", confirmClear && "animate-spin")} style={confirmClear ? { animationDuration: "1.5s" } : undefined} />
						<span>{confirmClear ? "Confirm clear?" : "New"}</span>
					</button>
				)}
			</Conversation>

			{/* Input area */}
			<div className="relative p-3" style={{ borderTop: "1px solid #E8E7E3" }}>
				<SlashCommandMenu
					items={slashMenu.items}
					heading={slashMenu.heading}
					selectedIndex={slashMenu.selectedIndex}
					onSelect={slashMenu.selectItem}
					visible={slashMenu.visible}
				/>
				<PromptInput
					onSubmit={handleSubmit}
					className="max-w-full"
					accept="image/*,.txt,.md,.json,.html,.css,.js,.ts,.tsx,.jsx,.py,.sh,.yaml,.yml,.toml,.xml,.csv"
				>
					<AttachmentPreviews />
					<PromptInputTextarea
						placeholder="Describe what you want to build... (/ for commands)"
	
						onChange={slashMenu.onTextareaChange}
						onKeyDown={slashMenu.onTextareaKeyDown}
					/>
					<PromptInputFooter>
						<div className="flex items-center gap-0.5">
							<PromptInputButton
								tooltip="Attach files"
								onClick={() => {
									const input = document.querySelector<HTMLInputElement>(
										'input[type="file"][aria-label="Upload files"]',
									);
									input?.click();
								}}
							>
								<PaperclipIcon className="size-3.5" />
							</PromptInputButton>
							<ModelSelector models={AVAILABLE_MODELS} current={currentModel} onSwitch={switchModel} thinking={thinking} onSwitchThinking={switchThinkingLevel} />
						</div>
						{usage && (
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
								<span>{formatTokens(usage.totalTokens)} tokens</span>
								<span className="opacity-40">·</span>
								<span>{formatCost(usage.cost)}</span>
								{usage.contextPercent != null && (
									<>
										<span className="opacity-40">·</span>
										<span
											className={cn(
												usage.contextPercent > 85
													? "text-red-500"
													: usage.contextPercent > 60
														? "text-yellow-500"
														: undefined,
											)}
										>
											ctx {Math.round(usage.contextPercent)}%
										</span>
									</>
								)}
							</div>
						)}
						<PromptInputSubmit status={chatStatus} onStop={stop} />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}

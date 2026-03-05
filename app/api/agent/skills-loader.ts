/**
 * Load bundled skills from the project's skills/ directory into OverlayFs.
 *
 * At startup: read from disk → write into OverlayFs → return Skill[] for system prompt.
 * At runtime: agent uses `read` tool to load skill files on-demand from OverlayFs.
 */

import { readdirSync, readFileSync, type Dirent } from "fs";
import { join } from "path";
import { parseFrontmatter, type Skill, type SkillFrontmatter } from "@mariozechner/pi-coding-agent";
import type { OverlayFs } from "just-bash";

/** Where skills live relative to project root */
const SKILLS_DIR = join(process.cwd(), "skills");

/** Where skills are mounted inside OverlayFs */
const SKILLS_MOUNT = "/skills";

/**
 * Recursively copy a directory from real FS into OverlayFs.
 */
async function copyDirToOverlay(fs: OverlayFs, srcDir: string, destDir: string) {
	await fs.mkdir(destDir, { recursive: true });
	for (const entry of readdirSync(srcDir, { withFileTypes: true }) as Dirent[]) {
		if (entry.name.startsWith(".")) continue;
		const srcPath = join(srcDir, entry.name);
		const destPath = join(destDir, entry.name);
		if (entry.isDirectory()) {
			await copyDirToOverlay(fs, srcPath, destPath);
		} else if (entry.isFile()) {
			const content = readFileSync(srcPath);
			await fs.writeFile(destPath, content);
		}
	}
}

/**
 * Load all bundled skills into OverlayFs and return Skill[] metadata.
 *
 * Discovery: each direct child directory of skills/ that contains a SKILL.md.
 */
export async function loadBundledSkills(
	fs: OverlayFs,
	mountPoint: string,
): Promise<Skill[]> {
	let entries: Dirent[];
	try {
		entries = readdirSync(SKILLS_DIR, { withFileTypes: true }) as Dirent[];
	} catch {
		return []; // no skills/ directory
	}

	const skills: Skill[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

		const skillDir = join(SKILLS_DIR, entry.name);
		const skillFile = join(skillDir, "SKILL.md");

		let raw: string;
		try {
			raw = readFileSync(skillFile, "utf-8");
		} catch {
			continue; // no SKILL.md, skip
		}

		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(raw);
		if (!frontmatter.description) continue; // required per spec

		// Copy entire skill directory into OverlayFs
		const destDir = join(mountPoint, SKILLS_MOUNT, entry.name);
		await copyDirToOverlay(fs, skillDir, destDir);

		const name = frontmatter.name || entry.name;
		const virtualPath = join(destDir, "SKILL.md");
		skills.push({
			name,
			description: frontmatter.description!,
			// Both paths point to OverlayFs so agent's read tool and
			// system prompt <location> work correctly
			filePath: virtualPath,
			baseDir: destDir,
			source: "project",
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		});

		console.log(`[skills] loaded: ${name}`);
	}

	return skills;
}

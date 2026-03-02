/**
 * Re-export shared Remotion compiler for client-side use.
 * The actual logic lives in lib/remotion-compile.ts.
 */
export { compileRemotionCode, isRemotionCode, parseRemotionConfig } from "@/lib/remotion-compile";
export type { CompilationResult } from "@/lib/remotion-compile";

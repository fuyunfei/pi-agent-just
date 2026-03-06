---
name: remotion-best-practices
description: "ALWAYS read this before writing or reviewing any Remotion .tsx code. Contains authoritative rules for animations, transitions, sequencing, 3D, GIFs, text layout, audio, and video."
metadata:
  tags: remotion, video, react, animation, composition
---

## When to use

Use this skill whenever you are dealing with Remotion code to obtain domain-specific knowledge.

## Sandbox constraints

This is a browser-based sandbox. Available imports are injected as globals — no real file system or Node.js runtime.

**Available from "remotion":**
AbsoluteFill, Sequence, Series, Img, Audio, Video,
interpolate, interpolateColors, spring, Easing,
useCurrentFrame, useVideoConfig, staticFile,
useCurrentScale, delayRender, continueRender, cancelRender, useDelayRender

**Available from "@remotion/shapes":**
Rect, Circle, Triangle, Star, Polygon, Ellipse, Heart, Pie (+ make* variants)

**Available from "@remotion/transitions":**
TransitionSeries, linearTiming, springTiming, fade, slide, wipe, flip, clockWipe

**Available from "@remotion/lottie":** Lottie

**Available from "@remotion/gif":** Gif, getGifDurationInSeconds, preloadGif

**Available from "@remotion/layout-utils":** measureText, fitText, fitTextOnNLines, fillTextBox

**Available from "@remotion/three" + "three":** ThreeCanvas, THREE

**NOT available:** staticFile resolves to path strings only (no real public/ dir), mediabunny, @remotion/captions, @remotion/google-fonts, calculateMetadata, Composition (root-level config is handled automatically)

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/3d.md](rules/3d.md) - 3D content in Remotion using Three.js and React Three Fiber
- [rules/animations.md](rules/animations.md) - Fundamental animation skills for Remotion
- [rules/assets.md](rules/assets.md) - Importing images, videos, audio, and fonts into Remotion
- [rules/audio.md](rules/audio.md) - Using audio and sound in Remotion - importing, trimming, volume, speed, pitch
- [rules/charts.md](rules/charts.md) - Chart and data visualization patterns for Remotion
- [rules/display-captions.md](rules/display-captions.md) - Displaying captions in Remotion with TikTok-style pages and word highlighting
- [rules/gifs.md](rules/gifs.md) - Displaying GIFs synchronized with Remotion's timeline
- [rules/images.md](rules/images.md) - Embedding images in Remotion using the Img component
- [rules/lottie.md](rules/lottie.md) - Embedding Lottie animations in Remotion
- [rules/measuring-dom-nodes.md](rules/measuring-dom-nodes.md) - Measuring DOM element dimensions in Remotion
- [rules/measuring-text.md](rules/measuring-text.md) - Measuring text dimensions, fitting text to containers, and checking overflow
- [rules/sequencing.md](rules/sequencing.md) - Sequencing patterns for Remotion - delay, trim, limit duration of items
- [rules/tailwind.md](rules/tailwind.md) - Using TailwindCSS in Remotion
- [rules/text-animations.md](rules/text-animations.md) - Typography and text animation patterns for Remotion
- [rules/timing.md](rules/timing.md) - Interpolation curves in Remotion - linear, easing, spring animations
- [rules/transitions.md](rules/transitions.md) - Scene transition patterns for Remotion
- [rules/trimming.md](rules/trimming.md) - Trimming patterns for Remotion - cut the beginning or end of animations
- [rules/videos.md](rules/videos.md) - Embedding videos in Remotion - trimming, volume, speed, looping, pitch

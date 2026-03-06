---
name: videos
description: Embedding videos in Remotion - trimming, volume, speed, looping, pitch
metadata:
  tags: video, media, trim, volume, speed, loop, pitch
---

# Using videos in Remotion

## Basic usage

Use `<Video>` from `remotion` with a URL:

```tsx
import { Video } from "remotion";

export const MyComposition = () => {
  return <Video src="https://example.com/video.mp4" />;
};
```

## Trimming

Use `trimBefore` and `trimAfter` (values in frames):

```tsx
const { fps } = useVideoConfig();

return (
  <Video
    src="https://example.com/video.mp4"
    trimBefore={2 * fps}
    trimAfter={10 * fps}
  />
);
```

## Delaying

Wrap in `<Sequence>`:

```tsx
const { fps } = useVideoConfig();

return (
  <Sequence from={1 * fps}>
    <Video src="https://example.com/video.mp4" />
  </Sequence>
);
```

## Sizing and Position

```tsx
<Video
  src="https://example.com/video.mp4"
  style={{
    width: 500,
    height: 300,
    position: "absolute",
    top: 100,
    left: 50,
    objectFit: "cover",
  }}
/>
```

## Volume

Static:

```tsx
<Video src="https://example.com/video.mp4" volume={0.5} />
```

Dynamic callback (f starts at 0 when video begins):

```tsx
const { fps } = useVideoConfig();

return (
  <Video
    src="https://example.com/video.mp4"
    volume={(f) =>
      interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })
    }
  />
);
```

Mute entirely:

```tsx
<Video src="https://example.com/video.mp4" muted />
```

## Speed

```tsx
<Video src="https://example.com/video.mp4" playbackRate={2} />
<Video src="https://example.com/video.mp4" playbackRate={0.5} />
```

Reverse playback is not supported.

## Looping

```tsx
<Video src="https://example.com/video.mp4" loop />
```

`loopVolumeCurveBehavior`: `"repeat"` (default) or `"extend"`.

## Pitch

`toneFrequency` (0.01 to 2). Only works during server-side rendering.

```tsx
<Video src="https://example.com/video.mp4" toneFrequency={1.5} />
```

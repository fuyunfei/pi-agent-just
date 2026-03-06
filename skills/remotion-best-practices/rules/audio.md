---
name: audio
description: Using audio and sound in Remotion - trimming, volume, speed, pitch
metadata:
  tags: audio, media, trim, volume, speed, loop, pitch, mute, sound, sfx
---

# Using audio in Remotion

## Importing Audio

Use `<Audio>` from `remotion` with a URL:

```tsx
import { Audio } from "remotion";

export const MyComposition = () => {
  return <Audio src="https://example.com/audio.mp3" />;
};
```

By default, audio plays from the start, at full volume and full length.
Multiple audio tracks can be layered by adding multiple `<Audio>` components.

## Trimming

Use `trimBefore` and `trimAfter` to remove portions. Values are in frames.

```tsx
const { fps } = useVideoConfig();

return (
  <Audio
    src="https://example.com/audio.mp3"
    trimBefore={2 * fps} // Skip the first 2 seconds
    trimAfter={10 * fps} // End at the 10 second mark
  />
);
```

## Delaying

Wrap in a `<Sequence>` to delay when it starts:

```tsx
const { fps } = useVideoConfig();

return (
  <Sequence from={1 * fps}>
    <Audio src="https://example.com/audio.mp3" />
  </Sequence>
);
```

## Volume

Static volume (0 to 1):

```tsx
<Audio src="https://example.com/audio.mp3" volume={0.5} />
```

Dynamic volume callback (f starts at 0 when audio begins, not composition frame):

```tsx
const { fps } = useVideoConfig();

return (
  <Audio
    src="https://example.com/audio.mp3"
    volume={(f) =>
      interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })
    }
  />
);
```

## Muting

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

return (
  <Audio
    src="https://example.com/audio.mp3"
    muted={frame >= 2 * fps && frame <= 4 * fps}
  />
);
```

## Speed

```tsx
<Audio src="https://example.com/audio.mp3" playbackRate={2} />
<Audio src="https://example.com/audio.mp3" playbackRate={0.5} />
```

Reverse playback is not supported.

## Looping

```tsx
<Audio src="https://example.com/audio.mp3" loop />
```

`loopVolumeCurveBehavior` controls frame count in volume callback:
- `"repeat"`: resets to 0 each loop (default)
- `"extend"`: continues incrementing

```tsx
<Audio
  src="https://example.com/audio.mp3"
  loop
  loopVolumeCurveBehavior="extend"
  volume={(f) => interpolate(f, [0, 300], [1, 0])}
/>
```

## Pitch

`toneFrequency` adjusts pitch without affecting speed (0.01 to 2). Only works during server-side rendering.

```tsx
<Audio src="https://example.com/audio.mp3" toneFrequency={1.5} />
```

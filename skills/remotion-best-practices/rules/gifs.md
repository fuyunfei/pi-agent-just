---
name: gif
description: Displaying GIFs and animated images in Remotion
metadata:
  tags: gif, animation, images, animated
---

# Using animated images in Remotion

## Gif component

Use `<Gif>` from `@remotion/gif` to display GIFs synchronized with Remotion's timeline:

```tsx
import { Gif } from "@remotion/gif";

export const MyComposition = () => {
  return <Gif src="https://example.com/animation.gif" width={500} height={500} />;
};
```

## Sizing and fit

Control how the image fills its container with the `fit` prop:

```tsx
<Gif src="https://example.com/animation.gif" width={500} height={300} fit="fill" />
<Gif src="https://example.com/animation.gif" width={500} height={300} fit="contain" />
<Gif src="https://example.com/animation.gif" width={500} height={300} fit="cover" />
```

## Playback speed

```tsx
<Gif src="https://example.com/animation.gif" width={500} height={500} playbackRate={2} />
<Gif src="https://example.com/animation.gif" width={500} height={500} playbackRate={0.5} />
```

## Looping behavior

```tsx
<Gif src="https://example.com/animation.gif" width={500} height={500} loopBehavior="loop" />
<Gif src="https://example.com/animation.gif" width={500} height={500} loopBehavior="pause-after-finish" />
<Gif src="https://example.com/animation.gif" width={500} height={500} loopBehavior="clear-after-finish" />
```

## Styling

Use `style` for additional CSS (use `width`/`height` props for sizing):

```tsx
<Gif
  src="https://example.com/animation.gif"
  width={500}
  height={500}
  style={{
    borderRadius: 20,
    position: "absolute",
    top: 100,
    left: 50,
  }}
/>
```

## Getting GIF duration

Use `getGifDurationInSeconds()` to match composition duration to a GIF:

```tsx
import { getGifDurationInSeconds } from "@remotion/gif";

const duration = await getGifDurationInSeconds("https://example.com/animation.gif");
// Use: Math.ceil(duration * fps) for durationInFrames
```

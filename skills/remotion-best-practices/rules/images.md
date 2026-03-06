---
name: images
description: Embedding images in Remotion using the Img component
metadata:
  tags: images, img, png, jpg, svg, webp
---

# Using images in Remotion

## The `<Img>` component

Always use `<Img>` from `remotion` to display images:

```tsx
import { Img } from "remotion";

export const MyComposition = () => {
  return <Img src="https://example.com/photo.png" />;
};
```

## Important restrictions

**You MUST use `<Img>` from `remotion`.** Do not use:
- Native HTML `<img>` elements
- CSS `background-image`

`<Img>` ensures images are fully loaded before rendering, preventing flickering and blank frames during video export.

## Using generated images

In this sandbox, use the `add_visual` tool to generate images. Use the exact URL returned by the tool:

```tsx
<Img src="/img/generated-photo.png" />
```

## Remote images

Remote URLs work directly (must have CORS enabled):

```tsx
<Img src="https://example.com/image.png" />
```

For animated GIFs, use `<Gif>` from `@remotion/gif` instead.

## Sizing and positioning

```tsx
<Img
  src="https://example.com/photo.png"
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

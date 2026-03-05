# Export System

## Pipeline

```
ExportButton → useRenderQueue → POST /api/render → Remotion Lambda → S3
                                                                      ↓
              download ← POST /api/render/concat ← pi-concat Lambda ←─┘
```

1. RemotionPreview emits `studio:render-data` event with `{ scenes[], fps }`
2. useRenderQueue distributes clips respecting `LAMBDA_BUDGET=200`
3. POST `/api/render` → `renderMediaOnLambda()` → poll `/api/render/progress` @1.2s
4. 2+ clips done → POST `/api/render/concat` → pi-concat Lambda → S3
5. Browser downloads merged MP4

## Files

| File | Role |
|------|------|
| `app/hooks/use-render-queue.ts` | State machine: queue, budget scheduler, poll, concat, retry |
| `app/api/render/route.ts` | Image inlining (`/img/*` → data URI) + `renderMediaOnLambda()` |
| `app/api/render/progress/route.ts` | `getRenderProgress()` → `{ progress | done | error }` |
| `app/api/render/concat/route.ts` | Parse S3 URLs → invoke pi-concat Lambda |
| `lambda/concat.mjs` | S3 GetObject × N → ffmpeg concat → S3 PutObject |
| `lib/remotion-compile.ts` | Babel transpile + global injection (React, Remotion, Three.js) |
| `remotion/DynamicComp.tsx` | Runtime code compilation, multi-scene TransitionSeries, watermark |
| `config.mjs` | `REGION`, `RAM=3009`, `DISK=10240`, `TIMEOUT=240` |

## Clip State Machine

```
  ┌──────┐   exportAll    ┌────────┐   renderOne    ┌───────────┐
  │ idle │ ──────────────►│ queued │ ──────────────►│ rendering │
  └──────┘                └────────┘                └─────┬─────┘
     ▲                       │                        /       \
     │                  cancelOne()              success     failure
     │                       │                    /             \
     │                       ▼               ┌──────┐      ┌───────┐
     │                    (idle)             │ done │      │ error │
     │                                       └──────┘      └───┬───┘
     │                                                         │
     └────────── reset() ◄───── retryFailed() ◄────────────────┘
```

## Budget Scheduler

Cap: `LAMBDA_BUDGET = 200` concurrent Lambda invocations.

```
estimateLambdas(durationInFrames):
  framesPerLambda = max(ceil(duration / 200), 20)
  return ceil(duration / framesPerLambda)
```

- `usedLambdas + cost ≤ 200` → launch
- Nothing in flight → launch anyway (anti-starvation)
- Cancelled clips (`skippedIds`) skipped without consuming budget

## Abort Architecture

Two-tier:
- **Global** `abortRef`: one per export session. `cancel()` fires this → relays to all per-clip controllers.
- **Per-clip** `clipAbortMap`: `cancelOne(clipId)` aborts just that clip. Queued clips go to `skippedIds`.

## Render Flow

```
POST /api/render { code, durationInFrames, fps }
  ├─ inlineImages(code, overlayFs)        // /img/abc.png → data:image/png;base64,...
  ├─ framesPerLambda = max(ceil(dur/200), 20)
  └─ renderMediaOnLambda({ codec: "h264", inputProps: { code, ... } })
       → { renderId, bucketName }

Poll: POST /api/render/progress { renderId, bucketName }
  └─ getRenderProgress()
       → { type: "done", url, size }
       → { type: "progress", progress }     // clamped min 3%
       → { type: "error", message }
```

## Concat Flow

```
POST /api/render/concat { urls }
  ├─ parseS3Url(url) → { bucket, key }       // virtual-hosted + path style
  └─ Lambda.invoke("pi-concat", { bucket, keys })
       ├─ Promise.all: S3 GetObject → /tmp/clip-N.mp4
       ├─ ffmpeg -f concat -c copy -movflags +faststart → /tmp/output.mp4
       └─ S3 PutObject → renders/concat-{id}.mp4
            → { url, size }
```

## Deploy

```bash
node deploy.mjs          # Remotion Lambda + site bundle + S3 bucket
node deploy-concat.mjs   # pi-concat Lambda + ffmpeg binary
```

**pi-concat Lambda config:** 256MB RAM, 512MB /tmp, 60s timeout, arm64, Node 22.

Deploy script: creates IAM role `pi-concat-role` (S3 + CloudWatch), downloads ffmpeg-linux-arm64 static binary, zips with handler. Zip > 50MB → uploads to S3 first.

## Env Vars

| Var | Used by |
|-----|---------|
| `AWS_ACCESS_KEY_ID` | render, concat, deploy |
| `AWS_SECRET_ACCESS_KEY` | render, concat, deploy |
| `AWS_REGION` | all (default: `us-east-1`) |
| `REMOTION_BUCKET_NAME` | concat deploy (S3 upload for >50MB zip) |

## Design Decisions

**Per-clip Lambda isolation** — Each scene renders independently. Gains: parallel execution, per-clip cancel/retry, budget control. Cost: needs concat step, loses Remotion-level cross-scene transitions.

**Image inlining** — AI code references `/img/*`. Route reads from OverlayFs, replaces with `data:` URIs before sending to Lambda. Avoids Lambda filesystem access.

**Dual compilation** — Same `compileRemotionCode()` in browser preview AND Lambda. Babel strips imports/exports, injects 104 globals via `new Function()`.

**Stream-copy concat** — `ffmpeg -c copy`. No re-encoding. Requires same codec/resolution (guaranteed: same Remotion config). ~100MB/s throughput.

**Concat on Lambda** — Same AWS region as S3. All traffic internal network. Previous approach (Next.js server) had two cross-network hops.

**Polling, not push** — 1.2s poll. Acceptable for UX, avoids WebSocket complexity.

## Known Issue: Image inlining fails on Vercel multi-instance

**Symptom:** `Error loading image with src: https://remotionlambda-xxx.s3.amazonaws.com/img/xxx.png`

**Root cause:** OverlayFs is in-memory, per Vercel serverless instance. When 8 concurrent render requests fire, most hit cold instances that create empty OverlayFs. `inlineImages()` silently catches `readFileBuffer` errors → original `/img/` path stays in code → Lambda resolves it against S3 site bucket → 404.

**Evidence (2026-03-05):** Lambda CloudWatch logs confirmed code arrived with raw `<Img src="/img/desert_oil.png" />` instead of `data:image/png;base64,...`. Session `d6d13d97` was active, 8 clips sent, 7 failed.

**Fix options:**
- **A. Frontend inline (治标):** Client fetches `/img/*` → data URI before sending to `/api/render`. Same multi-instance risk on fetch, but less likely for sequential requests.
- **B. Images to S3 (治本):** `add_visual` uploads to S3, returns public URL. Lambda fetches directly. Eliminates in-memory dependency entirely.

## Constraints

- **50MB Lambda zip limit** — ffmpeg ~70MB, deploy uploads to S3 first
- **512MB /tmp on pi-concat** — limits total clip size per concat
- **256MB memory on pi-concat** — uses stream upload to avoid OOM
- **Same codec required for `-c copy`** — guaranteed by uniform Remotion config
- **`isRunningRef` vs `isRunning`** — ref is source of truth (sync guard), state is UI-derived (may lag one render)

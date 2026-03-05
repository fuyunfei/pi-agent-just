# Export System Architecture

Per-clip render queue. Each scene renders independently on Lambda, fails independently, can be cancelled/retried individually. Multi-clip exports auto-concat via ffmpeg after all clips complete.

## Data Flow

```
RemotionPreview                  ExportButton              useRenderQueue
     │                               │                         │
     │  CustomEvent                   │                         │
     │  "studio:render-data"          │                         │
     │  { scenes[], fps }             │                         │
     ├──────────────────────────────► │                         │
     │                          build RenderJob[]               │
     │                          per selected scene              │
     │                                ├── exportAll(jobs) ────► │
     │                                │                    ┌────┴────┐
     │                                │                    │ 1 clip? │
     │                                │                    └────┬────┘
     │                                │               yes /         \ no
     │                                │              /               \
     │                           renderOne()    runBudgetScheduler()
     │                           + autoDownload    └─ renderOne() x N
     │                                │                    │
     │                                │              all done?
     │                                │                yes │
     │                                │             autoConcat()
     │                                │                    │
     │                                │              POST /api/render/concat
     │                                │                    │
     │                                ◄────────────────────┘
```

## Files

| File | Role |
|------|------|
| `app/api/render/route.ts` | Trigger Lambda render. Accepts single `{ code }` or `{ scenes[] }`. Inlines `/img/` as data URIs. Returns `{ renderId, bucketName }`. **Not modified.** |
| `app/api/render/progress/route.ts` | Poll Lambda status. Returns `progress \| done \| error`. **Not modified.** |
| `app/api/render/concat/route.ts` | Merge MP4s. Downloads clips to `/tmp`, runs `ffmpeg -c copy`, uploads to S3 or streams directly. |
| `app/hooks/use-render-queue.ts` | Client hook. Budget scheduler, per-clip state machine, abort controllers, auto-concat. |
| `app/components/code-studio/StudioToolbar.tsx` | UI. Scene selection dropdown, per-clip progress rows, retry/cancel buttons. |

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

Transitions:
- `idle → queued`: `exportAll()` marks all jobs queued
- `queued → rendering`: scheduler picks up job, creates per-clip AbortController
- `queued → idle`: `cancelOne()` on a queued clip (added to `skippedIds`)
- `rendering → done`: poll returns `type: "done"`, URL saved to `resultUrls`
- `rendering → idle`: AbortController aborted (cancel)
- `rendering → error`: poll returns `type: "error"` or fetch throws
- `error → queued`: `retryFailed()` re-queues only error-state clips
- `* → (cleared)`: `reset()` aborts everything, empties state map

## Budget Scheduler

Limits total concurrent Lambda invocations to `LAMBDA_BUDGET = 200`.

```
estimateLambdas(durationInFrames):
  framesPerLambda = max(ceil(duration / 200), 20)
  return ceil(duration / framesPerLambda)
```

Scheduling logic:
1. Pop next job from queue
2. Estimate its Lambda cost
3. If `usedLambdas + cost <= 200` OR nothing is in flight (large clip edge case) → launch
4. Otherwise wait for an in-flight job to complete (frees budget, calls `scheduleNext` recursively)
5. Cancelled clips (`skippedIds`) are skipped without consuming budget
6. Global abort stops scheduling new jobs; in-flight jobs get individual abort signals forwarded

## Abort Architecture

Two-tier abort:
- **Global** `abortRef`: one per `exportAll`/`retryFailed` session. `cancel()` fires this.
- **Per-clip** `clipAbortMap`: each rendering clip has its own AbortController. `cancelOne()` fires this.
- Global abort forwards to all per-clip controllers via `addEventListener("abort", ...)` relay.
- Queued (not yet rendering) clips use `skippedIds` set — scheduler checks before launching.

```
cancel()
  └─ abortRef.abort()
       └─ onGlobalAbort → clipAbort.abort() (for each in-flight clip)

cancelOne(clipId)
  ├─ clipAbortMap has controller? → abort it
  └─ else (queued) → add to skippedIds, set state to idle
```

## Auto-Concat

Triggers after `runBudgetScheduler` completes when `jobs.length >= 2` and all clips succeeded (all URLs collected in `resultUrls`).

POST `/api/render/concat` with ordered URL list. Server-side:
1. Download clips sequentially to `/tmp/concat-{uuid}/`
2. Write `list.txt` for ffmpeg concat demuxer
3. `ffmpeg -f concat -safe 0 -c copy -movflags +faststart output.mp4`
4. If `REMOTION_BUCKET_NAME` set → upload to S3, return `{ type: "success", data: { url, size } }`
5. If no S3 → read file into buffer, return as `video/mp4` response body
6. `finally` block cleans up temp directory

Client handles both response types by checking `Content-Type` header:
- `video/*` → `res.blob()` → `URL.createObjectURL` → download
- Otherwise → `res.json()` → use `data.url`

## retryFailed

1. Filters `jobs` to only those with `status === "error"` in current state
2. Resets those to `queued`; preserves `done` states for other clips
3. Seeds `resultUrls` from already-done clips (so auto-concat has the full URL set)
4. Runs budget scheduler on failed subset only
5. Attempts auto-concat with full job list if all clips now done

## UI States (ExportButton)

```
                          hasRemotionFiles && payload?
                                    │
                                no ─┤─ yes
                                    │
                              return null
                                    │
                         isActive || has non-done states?
                                    │
                              yes ─┤─ no
                               /        \
                          1 clip?     allDone?
                          /    \       /     \
                     inline   multi  yes     hasErrors?
                     progress  clip   │        │
                     bar      dropdown │     yes: Failed + Retry
                              with     │     no: idle scene picker
                              ClipRow  │
                              per job  │
                                      stateEntries.length === 1?
                                        yes: download link
                                        no: "N clips • X MB"
```

## Design Decisions

**Per-clip render vs single Lambda call**
- Old: all scenes packed into one `renderMediaOnLambda()`. Any scene error kills everything.
- New: each scene is an independent Lambda invocation. Trade-off: loses Remotion-level cross-scene transitions (assumes clean cuts). Gains fault isolation and individual retry.

**`-c copy` concat**
- No re-encoding. Requires all clips share identical codec settings (h264, same fps, resolution). This is guaranteed because all clips come from the same Remotion Lambda function with identical config.
- Very fast: just copies NAL units. Sub-second for typical video lengths.

**Buffer vs stream for no-S3 fallback**
- `readFileSync` into memory instead of `createReadStream`. Avoids race between `finally` cleanup and async stream consumption. Acceptable because concat output is typically <100MB.

**`isRunningRef` (ref) vs `isRunning` (derived state)**
- `isRunningRef` is the source of truth for guarding concurrent `exportAll`/`retryFailed` calls. Ref because it needs to be checked synchronously without waiting for React render.
- `isRunning` is derived from `states` map for UI consumption. May lag one render behind ref.

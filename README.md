# LongForm

**One prompt → a continuous 15-minute AI film, stitched from many short clips that never drift in style.**

AI video models generate 15–30 s clips with no memory between them. LongForm plans the whole film
first (Story Bible), locks style + characters + locations into text that is repeated *verbatim* in
every clip prompt, chains clips with image-to-video start frames and a vision-checked continuity
note, and assembles the result with ffmpeg.

```
prompt ─► A. Prompt Architect ─► B. Story Planner ─► [user approves Story Bible]
        ─► for each shot: C. Continuity Prompter ─► D. Generator (API | Browser) ─► E. Quality Gate ─┐
                                   ▲                                                                 │ pass
                                   └──────────────── last frame of previous clip ◄───────────────────┘
        ─► F. Assembler (ffmpeg, cuts/crossfades, music) ─► MP4
```

## Repository layout

| path | what |
|---|---|
| `packages/shared` | TypeScript types (zod), the **adapter interface** `ClipGenerator`, the deterministic **continuity prompter** (`buildClipPrompt`) and planner math. Unit-tested. |
| `packages/server` | Node/TypeScript API (Fastify) + BullMQ workers. Steps A–C and E call Claude; Step D runs API-mode adapters (Runway, Kling, Luma, Sora, Veo) or dispatches Browser-mode jobs to a Mac worker; Step F runs ffmpeg. Postgres + Redis + S3. |
| `packages/web` | React/Vite UI: Home, Story Bible editor, shot-progress grid, result player, settings. |
| `openapi/longform.yaml` | The one contract consumed by the web app and the Swift apps. |
| `providers/*.json` | Hot-swappable Browser-mode selector configs, one per provider. |
| `apps/swift` | `LongFormKit` (models, API client, `ClipGenerator` protocol, Keychain, shared SwiftUI views), the **macOS app** (UI + Browser-mode worker + on-device ffmpeg) and the **iOS app** (UI only). |

## Running the backend + web app

```bash
cp .env.example .env            # set ANTHROPIC_API_KEY at minimum
docker compose up -d            # postgres, redis, minio (S3)
pnpm install
pnpm --filter @longform/shared build
pnpm dev:server                 # API on :4000, migrations + queue workers embedded
pnpm dev:web                    # UI on :5173 (proxies /v1 to :4000)
```

Sign in with the email magic link (with no SMTP configured the server logs the token and returns it
as `devToken`). Add a provider API key under **Settings**, hit **Test connection**, then create a
project.

## Running the Apple apps

```bash
cd apps/swift
swift test                      # LongFormKit unit tests
brew install xcodegen && xcodegen   # generates LongForm.xcodeproj with macOS + iOS targets
```

The macOS app needs an `ffmpeg`/`ffprobe` binary (Homebrew or bundled in the app). Open the
**Browser Worker** window, enable a provider, and sign in to that provider's site in the embedded
browser: the worker only ever uses your existing logged-in session and never asks for credentials.

## How the non-negotiables are met

- **Style/character consistency.** `master.styleBlock` and every character/location
  `lockedDescription` are inserted verbatim into every prompt (`packages/shared/src/continuity.ts`);
  the test `continuity.test.ts` asserts the style block is byte-identical across shots. Each clip is
  image-to-video from the previous clip's last frame, and the Quality Gate (Claude vision) compares
  first/last frames with the film's style reference and the previous last frame; failing clips are
  regenerated up to `maxRetries` (default 2) with the gate's issues appended as a `[FIX]` note.
- **Every prompt stored + editable.** `shots.prompt` in Postgres; `PUT /projects/{id}/shots/{n}/prompt`;
  editable from the shot modal in web/iOS/macOS. Every attempt is kept in `clip_attempts`.
- **Resume without regenerating.** Shots in `passed` state are never touched by `resume()`,
  `replaceShots()` or a mode switch; the orchestrator always restarts at the first non-passed shot.
- **Mode-independent output.** Both modes implement the same `ClipGenerator` contract. The
  orchestrator downloads every clip into our storage, extracts first/last frames with ffmpeg and
  runs the same gate + assembler, so the pipeline never knows which mode produced a clip. If an API
  key is exhausted (401/402/403/429) and a Mac worker is online, the shot silently switches to
  Browser mode.

## Generation modes

**API mode** – `packages/server/src/providers/api/*.ts`, one class per provider over the shared
`ApiClipGenerator` skeleton (submit → poll → download).

**Browser mode** – the macOS worker (`apps/swift/Sources/LongFormMac`) polls
`POST /workers/{id}/pull`, drives the provider's web app in a `WKWebView` using the selector map in
`providers/<id>.json` (prompt box, start-frame upload, duration/ratio, Generate, wait, download),
uploads the clip to S3 via a presigned URL and reports back. Captchas, unexpected dialogs, logged-out
sessions and full queues pause the job and surface it in the worker window; "I fixed it — resume"
requeues it. Configs in `~/Library/Application Support/LongForm/providers/` override the bundled ones.

## Auth & secrets

Sign in with Apple (identity token verified against Apple's JWKS) or email magic link → 30-day JWT.
Provider API keys are AES-256-GCM encrypted at rest on the server (`KEY_ENCRYPTION_KEY`) and stored
in the Keychain on device.

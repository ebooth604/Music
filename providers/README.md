# Browser Mode adapter configs

One JSON file per provider describes **where things are on the provider's web app**. The macOS
worker loads these at runtime (`~/Library/Application Support/LongForm/providers/*.json` overrides the
bundled copies, and the app re-reads them whenever they change), so a site redesign is fixed by
editing a JSON file, not by shipping a new app.

Fields:

| key | meaning |
|---|---|
| `loggedInCheck` | selector that only exists when logged in, plus a URL fragment that means "logged out". The worker **never** types credentials; it pauses and asks the user to sign in inside the embedded browser. |
| `steps.openGenerator` | URL of the generation page |
| `steps.promptBox` | where to type the prompt |
| `steps.uploadStartFrame` | hidden `<input type=file>` used for the image-to-video start frame |
| `steps.setDuration` / `setAspectRatio` | open the picker, then click the option (`{{seconds}}` / `{{ratio}}` substituted) |
| `steps.generate` | the Generate button (must be enabled) |
| `steps.waitForCompletion` | selector that appears when the newest generation has a playable video; timeout and poll interval |
| `steps.download` | video element whose `src` is fetched, or a download button as fallback |
| `blockers.captcha` / `blockers.dialogs` | if any of these appear the worker **pauses** the job and surfaces it to the user |
| `rateLimit` | worker-side throttling and back-off when the site reports a full queue |

Selectors support the standard CSS syntax plus `:has-text('…')` and `text=/regex/i`, which the
worker's DOM helper (`BrowserDriver.swift`) implements in JavaScript.

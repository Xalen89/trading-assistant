# Preview sign-in route correction

The supplied IMG_2780 screenshot shows **Expo Unmatched Route** at `/api/oauth/start` on the managed Mobile Preview frontend. It is not a deployment build/runtime log.

## Confirmed cause and correction

A direct probe returned HTML/404 for both `/api/health` and `/api/oauth/start` on the 8328 frontend. Its paired 3000 API returned JSON/200 for health and **302 to `manus.im/app-auth`** for the same legitimate frontend sign-in origin. The earlier assumption that 8328 already forwarded API calls was incorrect.

The shared browser API resolver now maps **both exact Cloud frontend hosts (8081 and 8328)** to their paired 3000 API. Sign-in starts there, while the OAuth callback returns to the real frontend `/oauth/callback`. Callback exchange, session checks and tRPC use the same corrected resolver. Permanent publication still uses relative same-origin `/api`; native keeps its configured API URL. The fix does not accept lookalike domains, weaken origin/nonce checks or change owner-only permissions.

## Use the corrected Preview

Close the Unmatched Route page and open the root again:

https://8328-ifud8uxlezx8u8y20iv5v-f48dabb1.us1.manus.computer

Refresh the page, then tap **Sign in**. Opening it in Safari/a standalone browser tab remains preferable to an embedded webview. Do not reuse the failed `/api/oauth/start` address on the 8328 frontend or an old authorization callback.

## Verification and remaining status

The resolver, callback single-use completion, web login launcher and CORS regressions passed: **38 targeted tests**, TypeScript and ESLint. The raw public API start was verified to redirect to the real provider without logging nonce/cookie values or creating a user session. Actual browser-button verification is in progress; a provider redirect is not proof of completed owner sign-in.

The trade entry/working SL/TP markers remain saved. **Permanent private publication is still not complete** after its earlier deployment timeout; this routing repair does not solve or identify that separate deployment-stage failure. No paper/broker order, fake session, notification enrollment or new publication request was made for this fix.

**Final observed result:** reloaded the managed Preview root and clicked its real **Sign in** button. The browser navigated to the Manus authorization page with the actual frontend callback on8328; it did not reach Expo Unmatched Route. The corrected web source export also completed successfully. No credentials were entered and no authenticated user session was fabricated. Please restart from the root rather than the failed8328 API-as-page URL; owner sign-in itself remains the user's step.

The redirected page finished loading and displays **“Sign in to StratDesk Trading”** with the normal account sign-in methods. This confirms the reported missing-route failure is corrected through the real app button, not merely a manually entered API URL. The sign-in form was left untouched.

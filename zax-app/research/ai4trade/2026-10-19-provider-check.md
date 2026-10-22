# AI4Trade cannot yet replace the Zax scenario engine

Checked19October2026. Author: Manus AI.

AI4Trade's current official homepage and agent guide describe AI-Trader as a public environment where existing agents publish strategies/operations, discuss views, follow others and participate in paper-trading challenges. Its documented interface is a marketplace/signal/social API, not a verified hosted12-step price-path inference API for Zax. The published OpenAPI contract contains marketplace listings, including a `model-access` listing category, but it does not define an inference/chat-completion or same-source candle-forecast request/response. A listing category is not evidence of an available forecasting model. [1] [2] [3] [4]

Zax requires an actual provider contract that accepts owner-approved source context and returns bounded structured hypothetical steps while keeping the exact market/account/timeframe, ATR/anchor, timestamps, direction validation, null probability and current-versus-history semantics. The current AI4Trade documentation does not establish that contract, particularly for the selected TradeLocker NAS100 BID source. Its public signal feed cannot be relabelled as the owner's requested hypothetical candle path. The broad README market claims do not establish exact instrument support or trading accuracy. [2] [3]

The linked API documentation host `api.ai4trade.ai` could not be resolved by the read tool during this check; the main homepage and published repository documentation were accessible. This is an observed access limitation, not proof that every API is down. Registration and authentication details also differ between the current live guide and older OpenAPI/agent guide, so no credential flow or endpoint is invented. [2] [3] [4]

No AI4Trade account was created. No credential, broker information, source bars, screenshots, strategy, journal, position, discussion, signal, heartbeat or order was sent to the platform. No connector or working scenario provider is claimed. The existing Zax source remains unchanged and owner-only/paper-only. A private vendor inference contract, if the owner has one, can be assessed from its actual documentation. Otherwise a separate owner-authorized model-provider API is needed, with a server-only key; it is not supplied by the AI4Trade website link.

The earlier17October assessment of stale market-intelligence snapshots remains dated historical evidence and was not reused as current data. No new news/data probe was required for this inference-capability question. The current managed-AI account limitation was not investigated or estimated; account-service help belongs at https://help.manus.im.

## References

[1]: https://ai4trade.ai/ "AI-Trader official homepage and public-agent platform description"
[2]: https://ai4trade.ai/SKILL.md "AI-Trader live agent integration guide and documented operations"
[3]: https://raw.githubusercontent.com/HKUDS/AI-Trader/main/docs/api/openapi.yaml "Published marketplace and signal API specification"
[4]: https://raw.githubusercontent.com/HKUDS/AI-Trader/main/docs/README_AGENT.md "Official agent guide: marketplace, signal publication and copy trading"

## Independent OpenAI next step

The owner selected OpenAI in the connection-choice card; Gemini was not enabled. Endpoint inspection found that the existing OpenAI environment still resolves to the managed proxy, not a separate OpenAI account. That proxy credential will not be reused against another origin. A separately supplied app-only OpenAI API key is required for the proposed scenario-only direct adapter. The protected project-secret tool is currently unavailable during workspace recovery and saved-secret search is not available in this environment. The next input therefore uses a secure secret form, not chat. No external inference was invoked and no adapter or working scenario switch is delivered at this point.

## Delivered private input and scenario-only adapter — 12:15 update

The earlier connector/secure-card attempt did not present a usable input on the owner's iPhone. Zax now provides an actual masked text field in Chart → AI scenario layers, labelled **Paste your OpenAI API key here**, with **Save & connect**. Submission is owner-authenticated and secure-origin/native-session checked; the direct model catalog is verified before only an owner/app-bound encrypted envelope is stored. Status and error responses never return a key. No key is persisted on the phone or sent through ordinary chat.

The direct adapter is implemented and fixture-tested, not a verified live external forecast: it uses the fixed OpenAI Responses endpoint with `store:false`, bounded deadlines/bodies/quota, catalog-bound model choice, strict local source/direction/12-step materialization and null probability. No managed credential, external account identifier, screenshot or journal is in the direct request. Coach/Library and paper execution are unchanged. No owner key submission, direct inference, device success or publication has been performed by this task. Final software result is 851 passed / 0 failed / 1 pre-existing skip, with backend and web/iOS/Android source exports passed. This still does not establish an AI4Trade inference API or calibrated predictive edge.

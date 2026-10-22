# Direct OpenAI scenario contract

Checked 19 October 2026 from official documentation. The currently enabled connector is empty; no owner key or inference is verified. The generic OpenAI credential/API base still belongs to the Manus proxy and must not be redirected.

The direct API base is `https://api.openai.com/v1`. `GET /models` uses Authorization Bearer and returns model `id`, `owned_by` and optional shutdown metadata. The actual returned catalog—not model names in marketing/docs—is availability evidence. Source: https://platform.openai.com/docs/api-reference/models/list

`POST /responses` accepts model, input messages, reasoning effort, bounded max_output_tokens and `text.format` containing `{type:'json_schema',name,strict:true,schema}`. Set `store:false`, omit tools/background/conversation state. Read only output message content with `type:'output_text'`; `status:'incomplete'`, refused content, error envelope or empty/oversized text is not success. Never log upstream bodies or transmitted secrets. Source: https://platform.openai.com/docs/api-reference/responses/create

The current structured-output guide supports number minimum/maximum and array minItems/maxItems, requires all declared properties and `additionalProperties:false`, and notes refusal/incomplete handling. It does not make every string length constraint a provider-supported strict-schema keyword; locally enforce all string lengths and semantics and remove unsupported string minLength/maxLength from the transmitted schema if necessary. Source: https://developers.openai.com/api/docs/guides/structured-outputs

Zax retains forecastDraftSchema locally, precisely 12 ATR-offset steps, actual server anchor/ATR/time/source, direction matching, hypothetical-only volume-zero display and probability:null. The adapter supplies only a draft, never overwrites source or routes to an order. Efficient/deep direct models are GPT-5-mini/GPT-5 only when actual /models catalog allows them; no provider/model escalation on refusal.

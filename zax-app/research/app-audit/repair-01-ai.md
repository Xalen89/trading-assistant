# AI failure, quota and request-lifecycle repair

The scoped repair adds an allow-listed LLM failure-kind contract to the tRPC formatter, preserves terminal causes through Coach and Forecast, and uses fixed terminal-specific UI copy instead of suggesting an immediate retry. No upstream body or credentials are serialized. Both scenario controls use a 52-second device-side epoch/timer: controls recover on a transport stall, existing questions/scenarios are kept, and late results cannot overwrite them. This local timeout does not cancel server/model work.

Forecast and Coach now reserve application usage under the owner lock and can release the exact reservation once for known terminal catalog/completion failures producing no usable output. The parent integration additionally retains a separate bounded request-attempt count that is not released, preventing repeated terminal requests from bypassing abuse protection. This is application admission accounting, not Manus billing or refund handling.

The repair worker's focused mocked run passed 38 tests across four files. The parent corrected two React useRef initializers reported by the combined compiler. Final integration and test results are recorded in the report header, not inferred from these earlier targeted checks.

The only real model check made in the original read-only scan returned terminal-unavailable. There was no further model, provider, account, database or device operation, no alternate-provider bypass and no restored-inference claim. Source freshness, structured output validation and display-only/no-probability semantics remain intact.

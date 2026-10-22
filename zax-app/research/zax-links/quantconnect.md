# QuantConnect Research — Zax integration assessment

**Decision: implement independently in TypeScript; do not embed LEAN, QuantBook, or a QuantConnect data/API integration.** The public repository is a useful, Apache-2.0-licensed set of research demonstrations, not a drop-in Expo library. Its strongest overlap with Zax is a concrete pairs-trading reference: static Engle–Granger-style spread analysis and a small dynamic Kalman hedge-ratio example. It does not supply a ready counterpart to Zax’s fixed-universe quintile momentum, inverse-volatility trend allocation, purged classifier validation, or Coinbase L2 inventory-quote research. [1] [3]

## Repository, path, and license

The repository currently exists, is public, is not archived, and still uses `master`; GitHub reports the latest repository push as 2024-05-17. The exact static-pairs notebook remains at `Analysis/05 Pairs Trading Strategy Based on Cointegration.ipynb`; its last recorded change was the 2020-05-08 move of old analysis notebooks. Treat its code and results as an older educational example, not current production research. [1] [4] [5]

One path has changed: the README's Research2Production links omit the language directory, while the current repository exposes `Research2Production/Python/04 Kalman Filters and Pairs Trading.ipynb` and a parallel CSharp directory. Use the Python path above; do not build against the legacy README link. [2] [3]

I inspected the root `LICENSE` file, rather than relying on GitHub's badge. It is the **Apache License, Version 2.0**. Copying notebook code into a shipped derivative is permitted, but on redistribution it requires the license, retained copyright/patent/trademark/attribution notices, and prominent notices of modified files; the license grants no trademark permission. [6]

For Zax, the lower-risk choice is therefore an **independent implementation of the statistical method**, using no copied notebook source, QuantConnect branding, `QuantBook`, LEAN assemblies, or vendor data. Keep a short design provenance note linking to the notebooks. If any expressive notebook code is later copied, retain Apache-2.0 materials and have the owner review the intended distribution and attribution posture. This is an engineering licensing assessment, not legal advice.

## Useful additions to Zax

**1. Pairs diagnostics, not a replacement pairs engine.** Zax already has OLS/Engle–Granger pairs. Add a “QuantConnect-style reference configuration” only as a selectable research preset: daily adjusted, synchronized log prices; OLS hedge ratio and intercept; spread `log(y) − β log(x) − α`; ADF on the spread with `maxlag=1`; a **250-session rolling regression**; and a **1.5-standard-deviation** divergence marker. The notebook illustrates this on XOM/CVX daily history from 2003-01-01 to 2009-01-01 and reports an illustrative ADF p-value of 0.009. Those are example settings, not validated universal defaults. Expose all values, plus formation/trading dates, p-value, beta stability, zero-crossings, and out-of-sample paper P&L in Zax rather than silently adopting them. [4]

Do **not** copy the static notebook's full-sample selection/result framing into a Zax signal. Preserve Zax's chronological discipline: estimate only through each rebalance date, make the next-bar or next-session paper assumption explicit, and show the raw data cut-off. QuantConnect itself warns that research can create look-ahead bias when the same close is used for a decision and fill, or when training and testing reuse information. [10]

**2. Optional dynamic hedge-ratio experiment.** The current Python Research2Production notebook gives a compact two-state Kalman update for `price_two ≈ beta * price_one + intercept`. Its explicit demonstration parameters are `delta=1e-4`, process covariance `delta/(1-delta) * I₂`, observation variance `vt=1e-3`, initial state/covariance zero, and an example `$2,000` base quantity. It returns forecast error, `sqrt(Q_t)`, and a beta-derived hedge quantity. [7]

Implement the state update independently in a pure TypeScript analysis module, but normalize exposure by portfolio notional and beta; **do not carry over the fixed 2,000-share quantity, historical VIA/VIAB symbols, or any order code.** The Zax screen can plot time-varying beta, forecast error, `error / sqrt(Q_t)`, covariance, and a predeclared paper entry/exit threshold. Gate the experiment behind the same cointegration and walk-forward evidence that Zax already uses. The notebook contains no validated execution, fee, slippage, or threshold calibration, so it is not evidence for queue fills or live quoting. [7]

**3. Do not add the z-score helper as-is.** The adjacent stationary-process notebook checks `adfuller(...)[1] < 0.05` and standardizes a whole return series by its mean and standard deviation. That is a reasonable teaching helper, but whole-sample standardization is unsuitable for a forward paper view. Retain Zax's rolling, as-of-time calculation instead. [8]

These changes stay inside Zax's stated boundary: analytics and PAPER-only outcomes. They add no brokerage execution, exchange orders, credentials, or queue-fill claim.

## Data, access, and API facts

An independent implementation needs only Zax-permitted historical bars: aligned timestamps, a declared asset universe, corporate-action-consistent prices for equities, and an as-of cut-off. For the Coinbase-oriented studies, use synchronized, venue-specific mid/close data and retain the existing book-event provenance. QuantConnect data is **not required**.

Avoid importing QuantConnect downloads into Zax. QuantConnect says a Download license permits local storage only for the licensed organization's internal **LEAN** use and says data cannot be redistributed or converted in any format; it may be priced per file or per day. Its Dataset Market also includes paid licenses, though most price data is free for cloud use. [9]

QuantConnect Cloud research is optional and separate from the GitHub notebooks. A Free organization has a research node and cloud datasets for analysis, but the documented QuantConnect REST API is a **Quant Researcher-tier** feature, not a free-tier integration entitlement. The API requires a User ID and emailed API token; each request uses a timestamp plus SHA-256-derived Basic authorization rather than sending the raw token. [11] [12]

I could not verify a published **general QuantConnect REST requests-per-second/minute limit** in the official API index or authentication page reviewed. Do not repeat the uploaded Composer “500 req/sec” assertion: it is not a QuantConnect claim. If an owner later elects to use QuantConnect Cloud, obtain the tier and credentials deliberately, keep them server-side, cache locally, and implement conservative backoff on 429/5xx until QuantConnect gives an endpoint-specific quota. For this recommendation, do none of that: no account, provider registration, token, user-data transfer, vendor execution, or app-source change is needed. [11]

**References**

[1]: https://api.github.com/repos/QuantConnect/Research "GitHub repository metadata for QuantConnect Research"
[2]: https://api.github.com/repos/QuantConnect/Research/contents/Research2Production?ref=master "Research2Production current directory listing"
[3]: https://api.github.com/repos/QuantConnect/Research/contents/Research2Production/Python?ref=master "Research2Production Python notebook listing"
[4]: https://raw.githubusercontent.com/QuantConnect/Research/master/Analysis/05%20Pairs%20Trading%20Strategy%20Based%20on%20Cointegration.ipynb "Cointegration pairs notebook"
[5]: https://api.github.com/repos/QuantConnect/Research/commits?path=Analysis%2F05%20Pairs%20Trading%20Strategy%20Based%20on%20Cointegration.ipynb&per_page=1 "Latest commit for cointegration pairs notebook"
[6]: https://raw.githubusercontent.com/QuantConnect/Research/master/LICENSE "QuantConnect Research Apache License 2.0"
[7]: https://raw.githubusercontent.com/QuantConnect/Research/master/Research2Production/Python/04%20Kalman%20Filters%20and%20Pairs%20Trading.ipynb "Kalman filters and pairs trading notebook"
[8]: https://raw.githubusercontent.com/QuantConnect/Research/master/Research2Production/Python/05%20Stationary%20Processes%20and%20Z-Scores.ipynb "Stationary processes and z-scores notebook"
[9]: https://www.quantconnect.com/docs/v2/cloud-platform/datasets/licensing "QuantConnect dataset licensing"
[10]: https://www.quantconnect.com/docs/v2/cloud-platform/research/deployment "QuantConnect research deployment and look-ahead bias"
[11]: https://www.quantconnect.com/docs/v2/cloud-platform/api-reference/authentication "QuantConnect API authentication"
[12]: https://www.quantconnect.com/docs/v2/cloud-platform/organizations/tier-features "QuantConnect organization tier features"

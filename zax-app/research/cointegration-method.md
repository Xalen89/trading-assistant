# Engle–Granger residual-ADF diagnostic

`lib/trading/cointegration.ts` provides a bounded, standalone two-series diagnostic. Its null hypothesis is **no cointegration**, conditional on both price series being integrated of order one. The augmented Engle–Granger test first estimates a cointegrating regression and then applies a residual unit-root test. A small p-value can reject the null; it does not prove a causal relationship, an executable trading edge, or future performance.[1]

## Contract

`runEngleGrangerDiagnostic` accepts completed, timestamp-aligned `CompletedPricePair` objects with strictly increasing timestamps and finite positive `left` and `right` prices. It does not drop, fill, sort, or substitute observations. `window` is an integer from 30 through 4,000. The function diagnoses the latest equal window and, if an immediately preceding equal window is supplied, compares it with the current window.

The result always has `stat`, `pValue`, `criticalValues`, `decision`, `method`, `obs`, `lag`, and `limitations`. `pValue`, `stat`, and critical values are `null` whenever a formal statistic is unavailable. `status` distinguishes `invalid-input`, `insufficient-data`, `singular`, and `non-finite` from `ok`; it therefore never emits NaN, Infinity, or a fabricated result. The current OLS intercept and hedge ratio are reported only as diagnostic coefficients.

`comparison.status` is `possible-break` only when the immediately prior window rejected the no-cointegration null at the caller-selected size and the current window fails to reject it. This is a rolling warning, **not** a structural-break test. A prior result is included for inspection, and an unavailable prior window is explicit.

## Method implemented

For each current window, the first stage fits

> left<sub>t</sub> = a + b × right<sub>t</sub> + u<sub>t</sub>

by OLS with an intercept. The second stage estimates a residual ADF auxiliary regression with no deterministic term:

> Δu<sub>t</sub> = γu<sub>t−1</sub> + Σφ<sub>j</sub>Δu<sub>t−j</sub> + ε<sub>t</sub>

The reported statistic is the t-statistic for γ. Omitting the deterministic term in the residual ADF while using the intercept specification in the first-stage regression matches the Engle–Granger convention used by `statsmodels.coint`.[2]

The augmentation lag is fixed before inspecting prices: `min(24, ceil(12 × (window / 100)^0.25), floor((window − 3) / 2))`. It is based only on the selected window length, is feasible for the auxiliary regression, and is reused for the prior comparison. It deliberately does not choose a lag through AIC, BIC, a t-stat search, the diagnostic result, or an out-of-sample outcome. Callers performing rolling research should select their training window before obtaining the current result.

The p-value uses the verified MacKinnon 1994 asymptotic response-surface approximation for an intercept cointegrating regression with two I(1) series. The finite-sample 1%, 5%, and 10% critical values use the MacKinnon 2010 response surface for the same N=2 intercept case and `nobs = obs − 1`, which is the convention in `statsmodels.coint`.[2] [3] MacKinnon’s paper explains that these critical values are simulation-based response surfaces whose values depend on sample size.[3]

The numerical coefficient tables were reproduced from the permissively licensed `statsmodels` source after verifying the project’s BSD three-clause license. The code contains the complete copyright, redistribution, and disclaimer notice required for that reuse.[4] The regression, QR solution, residual scaling, and normal-CDF numerical integration are independently authored TypeScript.

## Verification and limits

`tests/trading/cointegration.test.ts` labels all generated inputs as synthetic. One deterministic fixture records results computed with an isolated **statsmodels 0.14.4** installation using `coint(left, right, trend='c', maxlag=13, autolag=None)`: statistic −3.84988079401048, p-value 0.011615890350443109, and critical values −3.990840331897465, −3.3879571944071745, and −3.080282412965186. That fixture verifies numerical compatibility only; it is not evidence about any market relationship.

The test requires the maintained assumptions, especially I(1) input series. It does not test integration order, multiple comparisons, nonlinear cointegration, changing costs, borrow, funding, fills, or structural breaks. The result is not a correlation proof, trading recommendation, success probability, or out-of-sample performance conclusion. Nearly constant regressors, exactly constant residuals, collinear auxiliary regressors, and non-finite arithmetic stop with an explicit status instead of a misleading p-value.

## References

[1]: https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.coint.html "statsmodels coint documentation"

[2]: https://raw.githubusercontent.com/statsmodels/statsmodels/main/statsmodels/tsa/stattools/_stattools.py "statsmodels cointegration implementation"

[3]: https://www.econstor.eu/bitstream/10419/67744/1/616664753.pdf "MacKinnon Critical Values for Cointegration Tests"

[4]: https://raw.githubusercontent.com/statsmodels/statsmodels/main/LICENSE.txt "statsmodels BSD three-clause license"

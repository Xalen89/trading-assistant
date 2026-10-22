# TradingView Lightweight Charts integration

Lightweight Charts is a client-side HTML5 Canvas library targeting ES2020, not a server renderer or a market-data feed. The official documentation currently describes v5.2, `createChart`, `addSeries`, synchronized panes, incremental `series.update`, and series primitives. The native app will retain Expo/React Native and use a locally bundled WebView surface; the browser surface will use the library directly. No remotely hosted TradingView widget, additional trading account, API key or quote provider is introduced. The earlier TradingView-Screener reference is a different product.

The package is Apache-2.0 licensed with required TradingView attribution/NOTICE and a TradingView link. Keep the vendor LICENSE/NOTICE in source and expose attribution on the chart. Official production standalone/IIFE distributions are available, though this implementation may bundle the same controller locally with esbuild. Never download chart code from a CDN at runtime or transfer account/session credentials to the native WebView.

Custom zones, CE/range lines, source-image templates and saved trade brackets use the same library time/price coordinate system. Primitives implement attach/detach, pane views, redraw and autoscale hooks. The existing historical scenario contains true historical source timestamps; render it at `anchorAt + (sourceCandle.time - sourceAt)` while retaining its original source dates in metadata. A historical replay is not actual future OHLC or a calibrated probability.

## References

[1]: https://tradingview.github.io/lightweight-charts/docs "Official Lightweight Charts getting started and license attribution"
[2]: https://github.com/tradingview/lightweight-charts "Official Apache-2.0 source and NOTICE requirements"
[3]: https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives "Official primitive lifecycle and time/price canvas integration"

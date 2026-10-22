# Zax Feature Specification

## Scope, Architecture, and Security

- **Product Posture:** Private, server-authorized owner workspace for analysis, education, research, and paper-only simulation.
- **Owner Authorization:** Server allowlist verifies session identity (OpenID or owner email); private children unmount and sidecars do not run if access is denied.
- **Workspace Schema:** Version 1 covering strategies, patterns, trades, alerts, levels, and settings. Local persistence uses AsyncStorage with a 2,000 ms debounce.
- **Exports/Imports:** Portable workspace export/import uses stratdesk-portable-v1 ZIP (max 5 MiB total, 2 MiB per entry).

## Markets, Charts, and Analysis

- **Market Sources:** TradeLocker default feed, supporting Coinbase crypto and FMP catalog items.
- **Timeframes:** 1m, 5m, 15m, 30m, 1h, 4h, 1d, and 1w.
- **Chart Presentation:** Local Lightweight Charts rendering with various overlays (EMA, SMA, Bollinger, ATR, RSI, MACD, VWAP, session boxes).
- **Strategies & Confluence:** Built-in presets and personal rulebooks. Native confluence gates evaluate closed-bar evidence against weighted conditions (threshold 0-100).
- **Session Rules:** Protocols for native ORB (Opening Range Breakout), NAS100 CFD adaptation, London Breakout, Initial Balance (IB), and Previous Day Close (PDC) continuation.

## Paper Lifecycle, Coach, and Quant Lab

- **Paper Lifecycle:** Immutable owner-bound proposal system supporting practice and strategy entry modes, bracket geometry, sizing templates (0.5%, 1%, 2%), and daily drawdown caps.
- **Coach & Scenarios:** Owner-gated AI educational chat and strict hypothetical scenario generation based on completed source bars.
- **Library & Evidence:** Secure intake, encryption, and structured review for images, PDFs, and text files up to 25 MiB.
- **Quant Lab:** Quantitative workbench providing tools for Pairs relative-value, Selected-universe momentum, Systematic trend, Venue market making, and Forward-return classifiers.
- **Alerts & Automation:** Local and cloud-saved alert rules, background scans, and strict consent-based automatic paper execution.

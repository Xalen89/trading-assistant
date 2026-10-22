import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// This produces a browser-only fixture. It neither starts a server nor calls a model.
// The temporary fixture server owns the one real, read-only mutation route.
const project = process.cwd();
const outputDirectory = resolve(project, "artifacts/quant-workbench-fixture");
const outputHtml = resolve(outputDirectory, "quant-workbench.html");
const browserFontServerContext = resolve(
  project,
  "node_modules/expo-font/build/serverContext.js",
);

const virtualMocks = {
  workspace: `
    export function useWorkspace() {
      return {
        // Deliberately a UI fixture identity, not a session, owner, or account.
        workspace: { market: "BTC-USD" },
        ready: true,
      };
    }
  `,
  trpc: `
    import { useState } from "react";

    const fixture = () => {
      const root = window;
      root.quantWorkbenchFixture ||= {
        label: "UI fixture only — not a real owner, account, or broker session",
        endpoint: "/fixture-api/quant/run",
        sequence: 0,
        mutations: [],
        navigation: null,
        visible: true,
      };
      return root.quantWorkbenchFixture;
    };

    const catalog = [
      { id: "BTC-USD", name: "Bitcoin", category: "Crypto", provider: "coinbase", providerSymbol: "BTC-USD", precision: 2, pointValue: 1 },
      { id: "ETH-USD", name: "Ethereum", category: "Crypto", provider: "coinbase", providerSymbol: "ETH-USD", precision: 2, pointValue: 1 },
    ];

    function useQuantMutation() {
      const [isPending, setPending] = useState(false);
      return {
        isPending,
        mutateAsync: async (input) => {
          const state = fixture();
          const startedAt = Date.now();
          const record = {
            startedAt,
            endpoint: state.endpoint,
            // Inputs only; no identity, import data, account state, or provider payload is retained.
            request: JSON.parse(JSON.stringify(input)),
          };
          state.mutations.push(record);
          setPending(true);
          let completion;
          try {
            const response = await fetch(state.endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
              signal: AbortSignal.timeout(52_000),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload.error || "Fixture quant endpoint returned HTTP " + response.status + ".");
            }
            record.response = {
              family: payload?.result?.family,
              status: payload?.result?.status,
              sourceCount: Array.isArray(payload?.series) ? payload.series.length : 0,
            };
            completion = { ok: true, family: payload?.result?.family, status: payload?.result?.status };
            return payload;
          } catch (error) {
            completion = {
              ok: false,
              error: error instanceof Error ? error.message : "Fixture quant request failed.",
            };
            record.error = completion.error;
            throw error;
          } finally {
            setPending(false);
            // setTimeout gives QuantWorkbench's awaited mutation continuation one turn to render its result/error.
            setTimeout(() => {
              const current = fixture();
              current.sequence += 1;
              current.lastCompletion = { ...completion, completedAt: Date.now() };
              window.dispatchEvent(new CustomEvent("quant-workbench-fixture-complete", { detail: current.lastCompletion }));
            }, 0);
          }
        },
      };
    }

    export const trpc = {
      market: {
        catalog: {
          useQuery: () => ({ data: catalog, isLoading: false, error: null }),
        },
      },
      quant: { run: { useMutation: useQuantMutation } },
    };
  `,
  router: `
    export function useRouter() {
      return {
        navigate: (target) => {
          const root = window;
          root.quantWorkbenchFixture ||= {};
          root.quantWorkbenchFixture.navigation = target;
          window.dispatchEvent(new CustomEvent("quant-workbench-fixture-navigation", { detail: target }));
        },
      };
    }
  `,
};

const aliases = new Map([
  ["@/hooks/use-workspace", "workspace"],
  ["@/lib/trpc", "trpc"],
  ["expo-router", "router"],
]);

const fixturePlugin = {
  name: "quant-workbench-fixture-boundaries",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^(?:@\/hooks\/use-workspace|@\/lib\/trpc|expo-router)$/ }, (args) => ({
      path: aliases.get(args.path),
      namespace: "quant-workbench-fixture-mock",
    }));
    buildApi.onLoad({ filter: /.*/, namespace: "quant-workbench-fixture-mock" }, (args) => ({
      contents: virtualMocks[args.path],
      loader: "tsx",
      resolveDir: project,
    }));
    // expo-font's `serverContext.web.js` is an SSR helper that imports node:async_hooks.
    // Browser builds use this package's installed no-op client module instead.
    buildApi.onResolve({ filter: /serverContext/ }, (args) => {
      if (args.importer.includes("/expo-font/build/")) {
        return { path: browserFontServerContext };
      }
      return undefined;
    });
  },
};

const browserEntry = `
  import React, { useEffect, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { Pressable, StyleSheet, Text, View } from "react-native";
  import { SafeAreaProvider } from "react-native-safe-area-context";
  import QuantWorkbench from "./components/trading/quant-workbench";

  const fixture = () => {
    window.quantWorkbenchFixture ||= {
      label: "UI fixture only — not a real owner, account, or broker session",
      endpoint: "/fixture-api/quant/run",
      sequence: 0,
      mutations: [],
      navigation: null,
      visible: true,
    };
    return window.quantWorkbenchFixture;
  };

  function App() {
    const [visible, setVisible] = useState(true);
    useEffect(() => {
      const state = fixture();
      state.visible = visible;
      if (visible) {
        state.ready = true;
        window.dispatchEvent(new CustomEvent("quant-workbench-fixture-ready"));
      } else {
        state.closedAt = Date.now();
        window.dispatchEvent(new CustomEvent("quant-workbench-fixture-closed"));
      }
    }, [visible]);

    return (
      <View nativeID="quant-workbench-fixture-shell" style={styles.shell}>
        <View style={styles.banner}>
          <Text style={styles.title}>QUANT WORKBENCH BROWSER FIXTURE</Text>
          <Text style={styles.copy}>UI fixture only — not a real owner, account, broker session, or saved workspace.</Text>
          <Text style={styles.copy}>Allowed fixture symbols: BTC-USD and ETH-USD. Runs use public Coinbase data through the local read-only service route.</Text>
        </View>
        {visible ? (
          <QuantWorkbench visible onClose={() => setVisible(false)} />
        ) : (
          <View style={styles.closed}>
            <Text style={styles.copy}>Fixture modal closed by its actual close callback.</Text>
          </View>
        )}
      </View>
    );
  }

  const styles = StyleSheet.create({
    shell: { flex: 1, minHeight: "100vh", backgroundColor: "#0B1017", padding: 10 },
    banner: { gap: 4, maxWidth: 720, alignSelf: "center", width: "100%" },
    title: { color: "#F4F7FB", fontWeight: "900", fontSize: 13 },
    copy: { color: "#97A5B7", fontSize: 10, lineHeight: 15 },
    closed: { marginTop: 20, padding: 14, borderWidth: 1, borderColor: "#344355", backgroundColor: "#151D29" },
  });

  fixture();
  createRoot(document.getElementById("root")).render(
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>,
  );
`;

const result = await build({
  stdin: {
    contents: browserEntry,
    resolveDir: project,
    sourcefile: "quant-workbench-browser-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  minify: false,
  sourcemap: false,
  define: { "process.env.NODE_ENV": '"development"', "process.env.EXPO_OS": '"web"', __DEV__: "true" },
  // This is the RN Web implementation, not a mock; the component itself imports react-native.
  alias: { "@": project, "react-native": "react-native-web" },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".css", ".json"],
  plugins: [fixturePlugin],
  loader: { ".ttf": "dataurl", ".js": "jsx" },
  write: false,
});

await mkdir(outputDirectory, { recursive: true });
const bundle = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await writeFile(
  outputHtml,
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Quant Workbench Browser Fixture</title>
    <style>html,body,#root{margin:0;min-height:100%;width:100%;background:#0B1017}body{font-family:system-ui,sans-serif}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${bundle}</script>
  </body>
</html>
`,
);
console.log(`Built actual QuantWorkbench RN Web fixture: ${outputHtml}`);
console.log("Next: inspect these scripts, then start only scripts/quant-workbench-fixture-server.ts on 8767 when authorized.");

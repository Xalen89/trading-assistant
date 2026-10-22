const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const fs = require("node:fs");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const configured = withNativeWind(config, {
  input: "./global.css",
  // Metro 57 uses FileMap changes sets; NativeWind's virtual-module emitter
  // still uses eventsQueue. Supported filesystem mode avoids that mismatch.
  forceWriteFileSystem: true,
});

// The installed interop adapter creates native placeholders but not web.css.
// A clean static export indexes its file map before the CSS transform writes it,
// which leaves the subsequently resolved file without a SHA-1 entry. Create only
// the missing placeholder before indexing; the normal NativeWind transform still
// generates the real CSS. Do not overwrite a running Preview's generated CSS.
const interopCache = path.resolve(
  path.dirname(require.resolve("react-native-css-interop/metro")),
  "../../.cache",
);
fs.mkdirSync(interopCache, { recursive: true });
try {
  fs.writeFileSync(path.join(interopCache, "web.css"), "", { flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}

module.exports = configured;

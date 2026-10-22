import * as Crypto from "expo-crypto";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { LocalLockService } from "./local-lock";

export const deviceLocalLock = new LocalLockService({
  platform: "native",
  crypto: {
    randomBytes: length => Crypto.getRandomBytes(length),
    derivePin: (pin,salt,iterations) => pbkdf2Async(sha256,new Uint8Array([...pin].map(c=>c.charCodeAt(0))),salt,{c:iterations,dkLen:32,asyncTick:10}),
  },
});

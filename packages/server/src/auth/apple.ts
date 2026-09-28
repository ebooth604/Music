import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

/** Verifies a Sign in with Apple identity token and returns the stable subject + optional email. */
export async function verifyAppleIdentityToken(idToken: string): Promise<{ sub: string; email?: string }> {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: config.appleClientId,
  });
  return { sub: payload.sub as string, email: typeof payload.email === "string" ? payload.email : undefined };
}

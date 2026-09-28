import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
}

export async function verifySession(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret);
  if (!payload.sub) throw new Error("no sub");
  return payload.sub;
}

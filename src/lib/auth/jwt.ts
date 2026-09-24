import { SignJWT, jwtVerify, importPKCS8, importSPKI, type CryptoKey } from "jose";

const ALG = "RS256";

function unescapePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

const PRIVATE_KEY_PEM = process.env.JWT_PRIVATE_KEY;
const PUBLIC_KEY_PEM = process.env.JWT_PUBLIC_KEY;

let cachedPrivateKey: Promise<CryptoKey> | null = null;
let cachedPublicKey: Promise<CryptoKey> | null = null;

function getPrivateKey(): Promise<CryptoKey> {
  if (!cachedPrivateKey) {
    if (!PRIVATE_KEY_PEM) {
      throw new Error(
        "JWT_PRIVATE_KEY is not set. Run `node scripts/generate-jwt-keys.mjs >> .env` and restart the server.",
      );
    }
    cachedPrivateKey = importPKCS8(unescapePem(PRIVATE_KEY_PEM), ALG);
  }
  return cachedPrivateKey;
}

function getPublicKey(): Promise<CryptoKey> {
  if (!cachedPublicKey) {
    if (!PUBLIC_KEY_PEM) {
      throw new Error("JWT_PUBLIC_KEY is not set. Run scripts/generate-jwt-keys.mjs and add both keys to .env");
    }
    cachedPublicKey = importSPKI(unescapePem(PUBLIC_KEY_PEM), ALG);
  }
  return cachedPublicKey;
}

const ACCESS_TOKEN_TTL_MIN = Number(process.env.JWT_ACCESS_TOKEN_TTL_MIN ?? 30);
const PENDING_2FA_TTL_MIN = 10;

// "Remember me": Chrome's practical cap on cookie Max-Age is 400 days, so
// that's used as the "until site data is cleared or the user logs out"
// duration for both the access token and its cookie.
export const REMEMBERED_ACCESS_TOKEN_TTL_DAYS = 400;

export type AccessTokenPayload = {
  sub: string; // userId
  role: "ADMIN" | "USER";
  sessionId: string; // LoginHistory.id for this login
};

export async function signAccessToken(
  payload: AccessTokenPayload,
  options?: { remembered?: boolean },
): Promise<string> {
  const expiration = options?.remembered ? `${REMEMBERED_ACCESS_TOKEN_TTL_DAYS}d` : `${ACCESS_TOKEN_TTL_MIN}m`;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(await getPrivateKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getPublicKey(), { algorithms: [ALG] });
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

export type PendingTwoFactorPayload = {
  sub: string; // userId
  remembered: boolean; // "Remember me" checkbox from the login form
};

export async function signPendingTwoFactorToken(payload: PendingTwoFactorPayload): Promise<string> {
  return new SignJWT({ ...payload, purpose: "2FA_PENDING" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_TTL_MIN}m`)
    .sign(await getPrivateKey());
}

export async function verifyPendingTwoFactorToken(token: string): Promise<PendingTwoFactorPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getPublicKey(), { algorithms: [ALG] });
    if (payload.purpose !== "2FA_PENDING" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, remembered: payload.remembered === true };
  } catch {
    return null;
  }
}

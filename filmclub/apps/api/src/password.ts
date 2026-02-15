import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_SCHEME = "scrypt";
const SCRYPT_KEYLEN = 64;

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${PASSWORD_SCHEME}$${salt}$${derived}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [scheme, salt, expectedHex] = storedHash.split("$");
  if (scheme !== PASSWORD_SCHEME || !salt || !expectedHex) {
    return false;
  }
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
};

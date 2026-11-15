const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BigInt(BASE62_CHARS.length);

/**
 * Encodes an integer/BigInt into a Base62 string.
 * Using Base62 ensures compact, collision-free, URL-safe short codes.
 */
export function encodeBase62(num: number | bigint): string {
  let value = BigInt(num);
  if (value === 0n) {
    return BASE62_CHARS[0];
  }

  let result = '';
  while (value > 0n) {
    const remainder = Number(value % BASE);
    result = BASE62_CHARS[remainder] + result;
    value = value / BASE;
  }
  return result;
}

/**
 * Decodes a Base62 string back into a BigInt ID.
 */
export function decodeBase62(str: string): bigint {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE62_CHARS.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character: ${char}`);
    }
    result = result * BASE + BigInt(index);
  }
  return result;
}

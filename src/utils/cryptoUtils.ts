/**
 * Cryptographic utility functions using the browser's native Web Crypto API.
 */

/**
 * Computes the SHA-256 hash of a string, returning a lowercase hex string.
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the HMAC-SHA-256 signature of a message using a key, returning a lowercase hex string.
 */
export async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(key);
  const messageBuffer = encoder.encode(message);
  
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageBuffer
  );
  
  const sigArray = Array.from(new Uint8Array(signature));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Array of bytes to Base64 string decoding
function b64ToUint6(nChr) {
  return nChr > 64 && nChr < 91
    ? nChr - 65
    : nChr > 96 && nChr < 123
    ? nChr - 71
    : nChr > 47 && nChr < 58
    ? nChr + 4
    : nChr === 43
    ? 62
    : nChr === 47
    ? 63
    : 0;
}

function base64DecToArr(sBase64, nBlocksSize) {
  const sB64Enc = sBase64.replace(/[^A-Za-z0-9+/]/g, ""); // Remove any non-base64 characters, such as trailing "=", whitespace, and more.
  const nInLen = sB64Enc.length;
  const nOutLen = nBlocksSize
    ? Math.ceil(((nInLen * 3 + 1) >> 2) / nBlocksSize) * nBlocksSize
    : (nInLen * 3 + 1) >> 2;
  const taBytes = new Uint8Array(nOutLen);

  let nMod3;
  let nMod4;
  let nUint24 = 0;
  let nOutIdx = 0;
  for (let nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << (6 * (3 - nMod4));
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      nMod3 = 0;
      while (nMod3 < 3 && nOutIdx < nOutLen) {
        taBytes[nOutIdx] = (nUint24 >>> ((16 >>> nMod3) & 24)) & 255;
        nMod3++;
        nOutIdx++;
      }
      nUint24 = 0;
    }
  }

  return taBytes;
}

/* Base64 string to array encoding */
function uint6ToB64(nUint6) {
  return nUint6 < 26
    ? nUint6 + 65
    : nUint6 < 52
    ? nUint6 + 71
    : nUint6 < 62
    ? nUint6 - 4
    : nUint6 === 62
    ? 43
    : nUint6 === 63
    ? 47
    : 65;
}

function base64EncArr(aBytes) {
  let nMod3 = 2;
  let sB64Enc = "";

  const nLen = aBytes.length;
  let nUint24 = 0;
  for (let nIdx = 0; nIdx < nLen; nIdx++) {
    nMod3 = nIdx % 3;
    // To break your base64 into several 80-character lines, add:
    //   if (nIdx > 0 && ((nIdx * 4) / 3) % 76 === 0) {
    //      sB64Enc += "\r\n";
    //    }

    nUint24 |= aBytes[nIdx] << ((16 >>> nMod3) & 24);
    if (nMod3 === 2 || aBytes.length - nIdx === 1) {
      sB64Enc += String.fromCodePoint(
        uint6ToB64((nUint24 >>> 18) & 63),
        uint6ToB64((nUint24 >>> 12) & 63),
        uint6ToB64((nUint24 >>> 6) & 63),
        uint6ToB64(nUint24 & 63)
      );
      nUint24 = 0;
    }
  }
  return (
    sB64Enc.substring(0, sB64Enc.length - 2 + nMod3) +
    (nMod3 === 2 ? "" : nMod3 === 1 ? "=" : "==")
  );
}


const aromaEncode = (mask, str) => {
  // If mask is not provided, use 0x00
  if(mask === undefined) {
    mask = new Uint8Array([0x00]);
  }
  // Compress and encode to uint8array
  let b = pako.gzip(str);
  // Remove magic number 1f 8b
  b = b.slice(2);
  // XOR with mask
  let l = mask.length;
  let last = 0;
  for (let i = 0; i < b.length; i++) {
    b[i] ^= mask[i % l];
    b[i] ^= last;
    last = b[i];
  }
  // Encode to base64
  return base64EncArr(b);
};

const aromaDecode = (mask, str) => {
  // If mask is not provided, use 0x00
  if(mask === undefined) {
    mask = new Uint8Array([0x00]);
  }
  // Decode from base64 to Uint8Array
  let b = base64DecToArr(str);
  // XOR with mask
  let last = 0;
  let l = mask.length;
  for (let i = 0; i < b.length; i++) {
    let t = b[i];
    b[i] ^= last;
    b[i] ^= mask[i % l];
    last = t;
  }
  // Add magic number 1f 8b
  b = new Uint8Array([0x1f, 0x8b, ...b]);
  // Decompress to uint8
  let s = pako.ungzip(b);
  // Convert Uint8Array to string
  return new TextDecoder().decode(s);
};

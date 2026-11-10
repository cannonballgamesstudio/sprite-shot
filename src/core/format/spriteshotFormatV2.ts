/**
 * Sprite Shot Binary Format V2
 *
 * Header (20 bytes):
 *   [0..3]   Magic: "CBAL" (4 bytes)
 *   [4..5]   Schema version: uint16 LE
 *   [6..7]   Flags: uint16 LE (bit 0 = compressed)
 *   [8..11]  Uncompressed size: uint32 LE
 *   [12..15] Compressed size: uint32 LE
 *   [16..19] CRC32 of compressed payload: uint32 LE
 *
 * Payload (N bytes):
 *   pako-deflated UTF-8 JSON
 */

import { deflate, inflate } from 'pako';
import type { SpriteShotProjectV2 } from './schema';
import { SCHEMA_VERSION, validateProjectV2 } from './schema';
import { migrateToLatest } from './migrations';

const MAGIC = 'SPSH';
const HEADER_SIZE = 20;
const FLAG_COMPRESSED = 1;

// ── CRC32 (same algorithm as V1, kept for compatibility) ──────────

const crc32Table: number[] = [];
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  crc32Table[i] = crc;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Serialization ─────────────────────────────────────────────────

export function serialize(project: SpriteShotProjectV2): Uint8Array {
  // Ensure schema version is set
  const toSerialize = { ...project, schemaVersion: SCHEMA_VERSION };

  // Encode to UTF-8
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(toSerialize));

  // Compress with pako deflate
  const compressed = deflate(jsonBytes);
  const checksum = crc32(compressed);

  // Build header
  const result = new Uint8Array(HEADER_SIZE + compressed.length);
  const view = new DataView(result.buffer);

  // Magic
  const magicBytes = encoder.encode(MAGIC);
  result.set(magicBytes, 0);

  // Schema version (uint16)
  view.setUint16(4, SCHEMA_VERSION, true);

  // Flags (uint16)
  view.setUint16(6, FLAG_COMPRESSED, true);

  // Uncompressed size (uint32)
  view.setUint32(8, jsonBytes.length, true);

  // Compressed size (uint32)
  view.setUint32(12, compressed.length, true);

  // CRC32 (uint32)
  view.setUint32(16, checksum, true);

  // Payload
  result.set(compressed, HEADER_SIZE);

  return result;
}

// ── Deserialization ───────────────────────────────────────────────

export interface DeserializeResult {
  project: SpriteShotProjectV2;
  migrated: boolean; // true if the file was migrated from an older version
  originalVersion: number;
}

export function deserialize(data: Uint8Array): DeserializeResult {
  if (data.length < HEADER_SIZE) {
    throw new Error('Invalid scene file: too small');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  // Check magic
  const magic = decoder.decode(data.slice(0, 4));
  if (magic !== MAGIC) {
    throw new Error(`Invalid scene file: wrong magic (expected ${MAGIC}, got ${magic})`);
  }

  // Read version — detect V1 vs V2 by checking byte width
  // V1 used uint32 at offset 4, V2 uses uint16 at offset 4
  // If version reads as 1 with uint32, it's V1 (16-byte header)
  // If version reads as 2 with uint16, it's V2 (20-byte header)
  const versionU16 = view.getUint16(4, true);
  const versionU32 = view.getUint32(4, true);

  let compressedData: Uint8Array;

  if (versionU32 === 1) {
    // V1 format: 16-byte header, uint32 version, custom RLE compression
    const v1DataSize = view.getUint32(8, true);
    const v1Checksum = view.getUint32(12, true);

    if (data.length < 16 + v1DataSize) {
      throw new Error('Invalid V1 scene file: truncated data');
    }

    compressedData = data.slice(16, 16 + v1DataSize);

    // Verify V1 CRC32
    const actualCrc = crc32(compressedData);
    if (actualCrc !== v1Checksum) {
      throw new Error('V1 scene file corrupted: checksum mismatch');
    }

    // Decompress V1 RLE
    const jsonString = decompressV1RLE(compressedData);
    const rawProject = JSON.parse(jsonString);

    // Migrate V1 → V2
    const migrated = migrateToLatest(rawProject, 1);
    return { project: migrated, migrated: true, originalVersion: 1 };

  } else if (versionU16 >= 2) {
    // V2+ format: 20-byte header
    const schemaVersion = versionU16;
    const flags = view.getUint16(6, true);
    const compressedSize = view.getUint32(12, true);
    const expectedCrc = view.getUint32(16, true);

    if (data.length < HEADER_SIZE + compressedSize) {
      throw new Error('Invalid V2 scene file: truncated data');
    }

    compressedData = data.slice(HEADER_SIZE, HEADER_SIZE + compressedSize);

    // Verify CRC32
    const actualCrc = crc32(compressedData);
    if (actualCrc !== expectedCrc) {
      throw new Error('Scene file corrupted: checksum mismatch');
    }

    // Decompress
    let jsonBytes: Uint8Array;
    if (flags & FLAG_COMPRESSED) {
      jsonBytes = inflate(compressedData);
    } else {
      jsonBytes = compressedData;
    }

    const jsonString = decoder.decode(jsonBytes);
    const rawProject = JSON.parse(jsonString);

    // Migrate if needed
    const needsMigration = schemaVersion < SCHEMA_VERSION;
    const project = needsMigration
      ? migrateToLatest(rawProject, schemaVersion)
      : (rawProject as SpriteShotProjectV2);

    // Validate
    const validation = validateProjectV2(project);
    if (!validation.valid) {
      console.warn('Project validation warnings:', validation.errors);
    }

    return {
      project,
      migrated: needsMigration,
      originalVersion: schemaVersion,
    };
  } else {
    throw new Error(`Unsupported scene file version: ${versionU16}`);
  }
}

// ── V1 RLE Decompression (for backward compatibility) ─────────────

function decompressV1RLE(data: Uint8Array): string {
  const decompressed: number[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0xFF && i + 2 < data.length) {
      const count = data[i + 1];
      const value = data[i + 2];
      for (let j = 0; j < count; j++) {
        decompressed.push(value);
      }
      i += 3;
    } else {
      decompressed.push(data[i]);
      i++;
    }
  }
  return new TextDecoder().decode(new Uint8Array(decompressed));
}

// ── Utilities ─────────────────────────────────────────────────────

export function getFileInfo(data: Uint8Array): {
  magic: string;
  version: number;
  isV1: boolean;
  compressedSize: number;
  totalSize: number;
} {
  if (data.length < 16) {
    throw new Error('File too small');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = new TextDecoder().decode(data.slice(0, 4));
  const versionU32 = view.getUint32(4, true);
  const versionU16 = view.getUint16(4, true);

  const isV1 = versionU32 === 1;

  return {
    magic,
    version: isV1 ? 1 : versionU16,
    isV1,
    compressedSize: isV1 ? view.getUint32(8, true) : view.getUint32(12, true),
    totalSize: data.length,
  };
}

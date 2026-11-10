import { SpriteShotProject } from '../types/project';

// CRC32 implementation for checksums
class CRC32 {
  private static table: number[] = [];
  
  static {
    // Generate CRC32 table
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      this.table[i] = crc;
    }
  }
  
  static calculate(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = this.table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// Simple compression using gzip-like deflate
class SimpleCompression {
  static compress(data: string): Uint8Array {
    // For now, use a simple UTF-8 encoding with basic compression
    // In a real implementation, you'd use a proper compression library
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    // Simple run-length encoding for demonstration
    const compressed: number[] = [];
    let i = 0;
    
    while (i < encoded.length) {
      const current = encoded[i];
      let count = 1;
      
      // Count consecutive identical bytes (max 255)
      while (i + count < encoded.length && encoded[i + count] === current && count < 255) {
        count++;
      }
      
      if (count > 3) {
        // Use RLE for sequences of 4 or more
        compressed.push(0xFF, count, current);
      } else {
        // Store bytes directly
        for (let j = 0; j < count; j++) {
          compressed.push(current);
        }
      }
      
      i += count;
    }
    
    return new Uint8Array(compressed);
  }
  
  static decompress(data: Uint8Array): string {
    const decompressed: number[] = [];
    let i = 0;
    
    while (i < data.length) {
      if (data[i] === 0xFF && i + 2 < data.length) {
        // RLE sequence
        const count = data[i + 1];
        const value = data[i + 2];
        for (let j = 0; j < count; j++) {
          decompressed.push(value);
        }
        i += 3;
      } else {
        // Direct byte
        decompressed.push(data[i]);
        i++;
      }
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(decompressed));
  }
}

export class SpriteShotFormatHandler {
  private static readonly MAGIC = 'SPSH';
  private static readonly VERSION = 1;
  
  /**
   * Serialize a SpriteShotProject to binary format
   */
  static serialize(project: SpriteShotProject): Uint8Array {
    // Convert project to JSON
    const projectJson = JSON.stringify(project, null, 0);
    
    // Compress the JSON data
    const compressedData = SimpleCompression.compress(projectJson);
    
    // Calculate checksum
    const checksum = CRC32.calculate(compressedData);
    
    // Create header
    const header = new ArrayBuffer(16);
    const headerView = new DataView(header);
    
    // Magic number (4 bytes)
    const encoder = new TextEncoder();
    const magicBytes = encoder.encode(this.MAGIC);
    for (let i = 0; i < 4; i++) {
      headerView.setUint8(i, magicBytes[i]);
    }
    
    // Version (4 bytes, little endian)
    headerView.setUint32(4, this.VERSION, true);
    
    // Compressed data size (4 bytes, little endian)
    headerView.setUint32(8, compressedData.length, true);
    
    // Checksum (4 bytes, little endian)
    headerView.setUint32(12, checksum, true);
    
    // Combine header and data
    const result = new Uint8Array(header.byteLength + compressedData.length);
    result.set(new Uint8Array(header), 0);
    result.set(compressedData, header.byteLength);
    
    return result;
  }
  
  /**
   * Deserialize binary data to SpriteShotProject
   */
  static deserialize(data: Uint8Array): SpriteShotProject {
    if (data.length < 16) {
      throw new Error('Invalid scene file: too small');
    }
    
    const headerView = new DataView(data.buffer, data.byteOffset, 16);
    
    // Check magic number
    const decoder = new TextDecoder();
    const magic = decoder.decode(data.slice(0, 4));
    if (magic !== this.MAGIC) {
      throw new Error(`Invalid scene file: wrong magic number (expected ${this.MAGIC}, got ${magic})`);
    }
    
    // Check version
    const version = headerView.getUint32(4, true);
    if (version !== this.VERSION) {
      throw new Error(`Unsupported scene file version: ${version} (expected ${this.VERSION})`);
    }
    
    // Get data size and checksum
    const dataSize = headerView.getUint32(8, true);
    const expectedChecksum = headerView.getUint32(12, true);
    
    if (data.length < 16 + dataSize) {
      throw new Error('Invalid scene file: truncated data');
    }
    
    // Extract compressed data
    const compressedData = data.slice(16, 16 + dataSize);
    
    // Verify checksum
    const actualChecksum = CRC32.calculate(compressedData);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Scene file corrupted: checksum mismatch (expected ${expectedChecksum}, got ${actualChecksum})`);
    }
    
    // Decompress data
    const projectJson = SimpleCompression.decompress(compressedData);
    
    // Parse JSON
    try {
      const project = JSON.parse(projectJson) as SpriteShotProject;
      
      // Convert date strings back to Date objects
      project.createdAt = new Date(project.createdAt);
      project.modifiedAt = new Date(project.modifiedAt);
      
      project.cameraPresets.forEach(preset => {
        preset.createdAt = new Date(preset.createdAt);
      });
      
      project.meshes.forEach(mesh => {
        mesh.importedAt = new Date(mesh.importedAt);
      });
      
      project.animations.forEach(animation => {
        animation.importedAt = new Date(animation.importedAt);
      });
      
      return project;
    } catch (error) {
      throw new Error(`Failed to parse scene file: ${error}`);
    }
  }
  
  /**
   * Validate a scene file without fully deserializing it
   */
  static validate(data: Uint8Array): { valid: boolean; error?: string; info?: { version: number; dataSize: number } } {
    try {
      if (data.length < 16) {
        return { valid: false, error: 'File too small' };
      }
      
      const headerView = new DataView(data.buffer, data.byteOffset, 16);
      
      // Check magic
      const decoder = new TextDecoder();
      const magic = decoder.decode(data.slice(0, 4));
      if (magic !== this.MAGIC) {
        return { valid: false, error: `Wrong magic number: ${magic}` };
      }
      
      // Check version
      const version = headerView.getUint32(4, true);
      if (version > this.VERSION) {
        return { valid: false, error: `Unsupported version: ${version}` };
      }
      
      // Check data size
      const dataSize = headerView.getUint32(8, true);
      if (data.length < 16 + dataSize) {
        return { valid: false, error: 'Truncated file' };
      }
      
      // Check checksum
      const expectedChecksum = headerView.getUint32(12, true);
      const compressedData = data.slice(16, 16 + dataSize);
      const actualChecksum = CRC32.calculate(compressedData);
      
      if (actualChecksum !== expectedChecksum) {
        return { valid: false, error: 'Checksum mismatch' };
      }
      
      return {
        valid: true,
        info: { version, dataSize }
      };
    } catch (error) {
      return { valid: false, error: `Validation error: ${error}` };
    }
  }
  
  /**
   * Get file info without full deserialization
   */
  static getFileInfo(data: Uint8Array): { 
    magic: string; 
    version: number; 
    dataSize: number; 
    checksum: number;
    totalSize: number;
  } {
    if (data.length < 16) {
      throw new Error('File too small');
    }
    
    const headerView = new DataView(data.buffer, data.byteOffset, 16);
    const decoder = new TextDecoder();
    
    return {
      magic: decoder.decode(data.slice(0, 4)),
      version: headerView.getUint32(4, true),
      dataSize: headerView.getUint32(8, true),
      checksum: headerView.getUint32(12, true),
      totalSize: data.length,
    };
  }
  
  /**
   * Create a backup copy with timestamp
   */
  static createBackupName(originalPath: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds and colons
    const pathParts = originalPath.split('.');
    const extension = pathParts.pop();
    const baseName = pathParts.join('.');
    
    return `${baseName}_backup_${timestamp}.${extension}`;
  }
}

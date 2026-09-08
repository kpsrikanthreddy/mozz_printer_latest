import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let electron: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  electron = require('electron');
} catch {
  // outside electron
}

export class SecureTokenStorage {
  private tokenFilePath: string;
  private memoryCache: string | null = null;
  private isOsEncryptionAvailable = false;

  constructor(customDir?: string) {
    let baseDir = customDir || '';
    if (!baseDir) {
      try {
        baseDir = electron?.app?.getPath?.('userData') || process.cwd();
      } catch {
        baseDir = process.cwd();
      }
    }
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.tokenFilePath = path.join(baseDir, 'device_token.enc');
    this.checkEncryptionAvailability();
  }

  private checkEncryptionAvailability(): void {
    try {
      if (electron?.safeStorage && typeof electron.safeStorage.isEncryptionAvailable === 'function') {
        this.isOsEncryptionAvailable = electron.safeStorage.isEncryptionAvailable();
      }
    } catch {
      this.isOsEncryptionAvailable = false;
    }
  }

  // Derive a fallback encryption key bound to local system characteristics if DPAPI/Keyring is unavailable
  private getFallbackKey(): Buffer {
    const machineSeed = `${process.env.USER || process.env.USERNAME || 'mozz_pos'}_${process.platform}_${process.arch}_mozz_hardware_salt_2026`;
    return crypto.scryptSync(machineSeed, 'mozz_pepper_salt_98450', 32);
  }

  /**
   * Encrypts and persists the device token.
   * Plain text token is NEVER written to disk, SQLite, or JSON.
   */
  public storeDeviceToken(plainToken: string): void {
    if (!plainToken || typeof plainToken !== 'string') {
      throw new Error('Invalid device token provided for storage');
    }

    this.checkEncryptionAvailability();
    let encryptedData: string;

    if (this.isOsEncryptionAvailable) {
      // OS-level secure storage (DPAPI on Windows, Keychain on macOS, Secret Service on Linux)
      const encryptedBuffer = electron.safeStorage.encryptString(plainToken);
      encryptedData = JSON.stringify({
        method: 'safeStorage',
        payload: encryptedBuffer.toString('base64'),
        updatedAt: new Date().toISOString(),
      });
    } else {
      console.warn(
        '[SecureStorage] OS safeStorage encryption (DPAPI/Keyring) is not available. Using machine-bound AES-256-GCM fallback.'
      );
      const iv = crypto.randomBytes(12);
      const key = this.getFallbackKey();
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      encryptedData = JSON.stringify({
        method: 'aes-256-gcm',
        iv: iv.toString('base64'),
        payload: ciphertext.toString('base64'),
        tag: tag.toString('base64'),
        updatedAt: new Date().toISOString(),
      });
    }

    // Atomic write
    const tempFile = `${this.tokenFilePath}.tmp`;
    fs.writeFileSync(tempFile, encryptedData, { mode: 0o600, encoding: 'utf-8' });
    fs.renameSync(tempFile, this.tokenFilePath);

    // Keep decrypted token only in main-process memory cache for fast network authorization
    this.memoryCache = plainToken;
  }

  /**
   * Decrypts the device token solely within the Electron main process.
   * This is never called by or returned to renderer IPC.
   */
  public getDeviceToken(): string | null {
    if (this.memoryCache) {
      return this.memoryCache;
    }

    if (!fs.existsSync(this.tokenFilePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.tokenFilePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (parsed.method === 'safeStorage') {
        if (!this.isOsEncryptionAvailable) {
          this.checkEncryptionAvailability();
        }
        if (!this.isOsEncryptionAvailable) {
          console.error('[SecureStorage] OS safeStorage is required to decrypt token, but not currently available.');
          return null;
        }
        const buf = Buffer.from(parsed.payload, 'base64');
        const decrypted = electron.safeStorage.decryptString(buf);
        this.memoryCache = decrypted;
        return decrypted;
      } else if (parsed.method === 'aes-256-gcm') {
        const key = this.getFallbackKey();
        const iv = Buffer.from(parsed.iv, 'base64');
        const ciphertext = Buffer.from(parsed.payload, 'base64');
        const tag = Buffer.from(parsed.tag, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        this.memoryCache = decrypted;
        return decrypted;
      }
    } catch (err) {
      console.error('[SecureStorage] Error decrypting stored token:', err);
      return null;
    }

    return null;
  }

  /**
   * Completely purges the device token from disk and memory upon logout or deactivation.
   */
  public clearDeviceToken(): void {
    this.memoryCache = null;
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        // Secure wipe: overwrite with random bytes before unlink
        const len = fs.statSync(this.tokenFilePath).size;
        fs.writeFileSync(this.tokenFilePath, crypto.randomBytes(Math.max(len, 64)));
        fs.unlinkSync(this.tokenFilePath);
      }
    } catch (err) {
      console.error('[SecureStorage] Error clearing token file:', err);
    }
  }

  public hasDeviceToken(): boolean {
    return !!this.getDeviceToken();
  }

  /**
   * Returns a masked representation (e.g. ••••••••3a8f) for UI display.
   * The raw token is NEVER sent to renderer.
   */
  public getMaskedToken(): string {
    const token = this.getDeviceToken();
    if (!token) return '';
    if (token.length <= 8) return '••••••••';
    return `••••••••••••${token.slice(-4)}`;
  }
}

export const secureTokenStorage = new SecureTokenStorage();

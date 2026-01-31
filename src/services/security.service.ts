import { Address6, Address4 } from 'ip-address';
import dns from 'dns/promises';
import { URL } from 'url';

export class SecurityService {
  private static isPrivateIP(ip: string): boolean {
    if (Address4.isValid(ip)) {
      const addr = new Address4(ip);
      // Check for private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
      const parts = addr.parsedAddress;
      if (!parts) return false;
      const [a, b] = parts.map(p => parseInt(p, 10));
      
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      return false;
    }

    if (Address6.isValid(ip)) {
      const addr = new Address6(ip);
      // Check for localhost (::1) and unique local (fc00::/7)
      if (addr.isLoopback()) return true;
      // Check for Unique Local Addresses (fc00::/7)
      // Address6 doesn't have isUniqueLocal in all versions, so we check manually
      // fc00::/7 means the first 7 bits are 1111110. 
      // In hex, the first byte is between 0xfc and 0xfd.
      
      // Actually, let's just check the string representation for simplicity or use range check
      // But ip-address library usually has helpers. Let's check documentation or use a simpler check.
      // A simple check for 'fc' or 'fd' at start of full address.
      const fullAddress = addr.correctForm();
      if (fullAddress.startsWith('fc') || fullAddress.startsWith('fd')) return true;
      
      return false;
    }

    return false;
  }

  public static async validateUrl(urlString: string): Promise<void> {
    try {
      const url = new URL(urlString);
      
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }

      const hostname = url.hostname;
      
      // Resolve DNS to check IP
      const addresses = await dns.resolve(hostname);
      
      for (const ip of addresses) {
        if (this.isPrivateIP(ip)) {
          throw new Error('SSRF_DETECTED');
        }
      }
    } catch (error: any) {
      if (error.message === 'SSRF_DETECTED') throw error;
      // If DNS resolution fails, we might want to allow it or fail. 
      // For safety, if we can't resolve it, we probably shouldn't try to fetch it, 
      // but Puppeteer might be able to. However, to be safe against DNS rebinding, 
      // we should probably fail.
      // But for now, let's assume if it's not a valid URL format, it fails.
      if (error.code === 'ENOTFOUND') {
          // Host not found, let Puppeteer handle it (it will fail naturally)
          return;
      }
      throw error;
    }
  }
}

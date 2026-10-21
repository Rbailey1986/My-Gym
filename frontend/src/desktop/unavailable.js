// Desktop stand-in for the phone-only plugins with no desktop equivalent:
// @aparajita/capacitor-secure-storage (the local Coach needs no API key, and lib/coach-secrets.js
// falls back to memory when SecureStorage has no get()) and @capacitor-mlkit/barcode-scanning
// (the desktop decodes check-in codes with lib/scan-web.js, as the browser does).
export const SecureStorage = null
export const BarcodeScanner = {
  async isSupported() { return { supported: false } }
}

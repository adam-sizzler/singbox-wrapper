let wasmInitPromise: Promise<void> | null = null;
let wasmReady = false;
let singboxVersion: string | null = null;

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
  version: string | null;
}

export const WasmValidator = {
  async init(): Promise<void> {
    if (wasmReady) return;
    if (wasmInitPromise) return wasmInitPromise;

    wasmInitPromise = (async () => {
      try {
        if (typeof window.Go === 'undefined') {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[src*="wasm_exec.js"]') as HTMLScriptElement | null;
            if (existing) {
              if (typeof window.Go !== 'undefined') {
                resolve();
                return;
              }
              existing.addEventListener('load', () => resolve());
              existing.addEventListener('error', () => reject(new Error('Failed to load existing wasm_exec.js')));
              return;
            }
            const script = document.createElement('script');
            script.src = './wasm_exec.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load wasm_exec.js script'));
            document.head.appendChild(script);
          });
        }

        if (typeof window.Go === 'undefined') {
          throw new Error('Go runtime (wasm_exec.js) not available');
        }

        const go = new window.Go();
        const initPromise = new Promise<void>((resolve) => {
          window.onWasmInitialized = () => {
            resolve();
          };
        });

        const resp = await fetch('./main.wasm');
        if (!resp.ok) {
          throw new Error(`Failed to fetch main.wasm: ${resp.status} ${resp.statusText}`);
        }
        const buffer = await resp.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buffer, go.importObject);

        // Run Go runtime in background
        go.run(instance);
        await initPromise;

        if (typeof window.SingboxParseConfig !== 'function') {
          throw new Error('SingboxParseConfig function not found in WASM exports');
        }

        if (typeof window.SingboxGetVersion === 'function') {
          singboxVersion = window.SingboxGetVersion();
        }

        wasmReady = true;
      } catch (err) {
        console.error('Failed to initialize Sing-box WASM validator:', err);
        wasmInitPromise = null;
        throw err;
      }
    })();

    return wasmInitPromise;
  },

  isReady(): boolean {
    return wasmReady;
  },

  getVersion(): string | null {
    return singboxVersion;
  },

  validate(configContent: string): ValidationResult {
    if (!wasmReady || typeof window.SingboxParseConfig !== 'function') {
      return {
        isValid: false,
        error: 'WASM validator is not initialized yet',
        version: null,
      };
    }

    try {
      // Basic JSON check first
      JSON.parse(configContent);
    } catch (e: any) {
      return {
        isValid: false,
        error: `JSON syntax error: ${e.message}`,
        version: singboxVersion,
      };
    }

    let payloadForWasm = configContent;
    try {
      const parsedObj = JSON.parse(configContent);
      // In browser WebAssembly (GOOS=js), sing-box's network manager has no OS socket access
      // and rejects auto_detect_interface. We temporarily set it to false for the WASM syntax check
      // so all other schema, outbounds, rules, and syntax are validated properly.
      let modified = false;
      if (parsedObj?.route?.auto_detect_interface) {
        parsedObj.route.auto_detect_interface = false;
        modified = true;
      }
      if (parsedObj?.inbounds && Array.isArray(parsedObj.inbounds)) {
        for (const ib of parsedObj.inbounds) {
          if (ib?.auto_detect_interface) {
            ib.auto_detect_interface = false;
            modified = true;
          }
        }
      }
      if (modified) {
        payloadForWasm = JSON.stringify(parsedObj);
      }
    } catch {
      // Handled by JSON check above
    }

    try {
      let result = window.SingboxParseConfig(payloadForWasm);
      if (result && /auto_detect_interface.*is only supported/i.test(result)) {
        result = result
          .replace(/.*auto_detect_interface.*is only supported on Linux, Windows and macOS.*/gi, '')
          .trim();
      }
      if (!result) {
        return {
          isValid: true,
          error: null,
          version: singboxVersion,
        };
      }
      return {
        isValid: false,
        error: result,
        version: singboxVersion,
      };
    } catch (e: any) {
      return {
        isValid: false,
        error: e.message || String(e),
        version: singboxVersion,
      };
    }
  },
};

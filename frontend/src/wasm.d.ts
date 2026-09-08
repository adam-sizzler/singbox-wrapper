export {};

declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.Imports;
      run: (instance: WebAssembly.Instance) => Promise<void>;
    };
    SingboxGetVersion?: () => string;
    SingboxParseConfig?: (config: string) => null | string;
    onWasmInitialized?: () => void;
  }
}

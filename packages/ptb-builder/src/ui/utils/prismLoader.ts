type PrismModule = typeof import('prismjs');

let prismPromise: Promise<PrismModule> | undefined;

export async function loadPrism(): Promise<PrismModule> {
  if (!prismPromise) {
    prismPromise = (async () => {
      const prismImport = await import('prismjs');
      const Prism = (prismImport as any).default ?? prismImport;

      await import('prismjs/components/prism-typescript');
      await import('prismjs/components/prism-javascript');
      await import('prismjs/plugins/line-numbers/prism-line-numbers');
      await import(
        'prismjs/plugins/normalize-whitespace/prism-normalize-whitespace'
      );

      return Prism as PrismModule;
    })();
  }
  return prismPromise;
}

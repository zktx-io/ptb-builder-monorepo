import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'rollup-plugin-postcss';

const THEME_FILES = [
  ['dark', 'theme.dark.css'],
  ['light', 'theme.light.css'],
  ['cobalt2', 'theme.cobalt2.css'],
  ['tokyo-night', 'theme.tokyo.night.css'],
  ['cream', 'theme.cream.css'],
  ['mint-breeze', 'theme.mint.breeze.css'],
];

function emitThemeAssets() {
  return {
    name: 'emit-theme-assets',
    generateBundle() {
      const imports = [];
      for (const [key, filename] of THEME_FILES) {
        const abs = path.resolve('src/ui/styles', filename);
        const source = fs.readFileSync(abs, 'utf8');
        const outName = `styles/theme-${key}.css`;
        this.emitFile({ type: 'asset', fileName: outName, source });
        imports.push(`@import './theme-${key}.css';`);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'styles/themes-all.css',
        source: `${imports.join('\n')}\n`,
      });
    },
  };
}

export default {
  input: 'src/index.tsx',
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: 'index.esm.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    assetFileNames: (assetInfo) => {
      if (assetInfo.name?.startsWith('styles/')) return assetInfo.name;
      return 'assets/[name]-[hash][extname]';
    },
    sourcemap: false,
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs({
      include: /node_modules/,
    }),
    typescript({
      tsconfig: './tsconfig.json',
    }),
    postcss({
      extensions: ['.css'],
      extract: 'index.css',
      minimize: true,
      modules: false,
      inject: false,
    }),
    emitThemeAssets(),
    terser({
      compress: { passes: 2, pure_getters: true, drop_console: false },
      mangle: { safari10: false },
      format: { comments: false },
    }),
  ],
  external: [
    /^react(\/.*)?$/,
    /^react-dom(\/.*)?$/,
    /^@mysten\/sui(\/.*)?$/,
    /^@xyflow\/react(\/.*)?$/,
    /^elkjs(\/.*)?$/,
    /^re-resizable(\/.*)?$/,
    /^lucide-react(\/.*)?$/,
  ],
  context: 'this',
  onwarn: (warning, warn) => {
    if (
      warning.code === 'CIRCULAR_DEPENDENCY' ||
      warning.message.includes('"use client"')
    ) {
      return;
    }
    warn(warning);
  },
};

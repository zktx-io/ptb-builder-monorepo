import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';

export default {
  input: 'src/index.tsx',
  output: [
    {
      file: 'dist/index.esm.js',
      format: 'esm',
    },
  ],
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

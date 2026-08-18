const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Reports esbuild failures with file/line info instead of a bare stack trace. */
const problemMatcherPlugin = {
  name: 'problem-matcher',
  setup(build) {
    build.onStart(() => console.log('[esbuild] build started'));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`\u2716 [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}`);
        }
      }
      console.log(`[esbuild] build finished with ${result.errors.length} error(s)`);
    });
  }
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    // The `vscode` module is provided by the extension host at runtime.
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'silent',
    plugins: [problemMatcherPlugin]
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv, type RsbuildPlugin } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { tanstackRouter } from '@tanstack/router-plugin/rspack'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The console renders only once the visitor's locale (about 140 KB brotli) has
// loaded, and the bundle asks for it only after it has downloaded and run. This
// inline script picks the language as i18next will (the `i18nextLng` cache,
// then the browser languages, mapped as convertDetectedLanguage maps them) and
// preloads that locale's chunk beside the entry bundle.
function pluginPreloadLocale(): RsbuildPlugin {
  return {
    name: 'preload-locale',
    setup(api) {
      api.modifyHTMLTags((tags, { compilation, assetPrefix }) => {
        const urls: Record<string, string> = {}
        for (const chunk of compilation.chunks) {
          const language = chunk.name?.match(/^locale-(.+)$/)?.[1]
          const file = [...chunk.files].find((name) => name.endsWith('.js'))
          if (language && file) urls[language] = assetPrefix + file
        }
        if (!urls.en) return tags
        const script = `(function(){var u=${JSON.stringify(urls)};function p(c){if(!c)return;var x=String(c).toLowerCase().replace(/_/g,'-');if(x.indexOf('zh')===0)return /^(zhtw|zh-tw|zh-hk|zh-mo|zh-hant)/.test(x)?'zhTW':'zhCN';if(u[c])return c;x=x.split('-')[0];if(u[x])return x}var c;try{c=p(localStorage.getItem('i18nextLng'))}catch(e){}var n=navigator.languages||[navigator.language];for(var i=0;!c&&i<n.length;i++)c=p(n[i]);var l=document.createElement('link');l.rel='preload';l.as='script';l.href=u[c||'en'];document.head.appendChild(l)})()`
        tags.headTags.unshift({ tag: 'script', children: script })
        return tags
      })
    },
  }
}

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    'http://localhost:3000'

  const isProd = envMode === 'production'
  const devProxy = Object.fromEntries(
    (['/api', '/v1', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: serverUrl, changeOrigin: true },
    ])
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [
      pluginReact(),
      pluginTailwindcss({ optimize: false }),
      pluginPreloadLocale(),
    ],
    // Rsbuild 2: replaces deprecated `performance.chunkSplit` (RSPack 2 aligned).
    // No forced vendor groups: a group with `chunks: 'all'` and `enforce` pulls
    // every module it matches, from any page, into one chunk that the entry
    // needs, so a first visit downloaded all of Base UI and TanStack Table.
    splitChunks: {
      preset: 'default',
    },
    source: {
      entry: {
        index: './src/main.tsx',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    html: {
      template: './index.html',
      favicon: './public/favicon.ico',
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      // Production optimizations
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
      // Rely on Rsbuild default legalComments ("linked" → per-chunk *.LICENSE.txt) in all modes.
      // Do not set "none" in production: that strips minifier-preserved third-party notices and
      // extracted license files, which some distributions require for open-source compliance.
    },
    performance: {
      // Remove console in production
      removeConsole: isProd ? ['log'] : false,
      buildCache: false,
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /\.json$/,
              resourceQuery: /overrides/,
              use: [
                path.resolve(__dirname, 'scripts/i18n-en-overrides-loader.cjs'),
              ],
            },
          ],
        },
        plugins: [
          tanstackRouter({
            target: 'react',
            // Dev: avoid per-route async chunks (reduces white flash on navigation + faster HMR feedback).
            // Prod: keep route-based code splitting.
            autoCodeSplitting: isProd,
          }),
        ],
      },
    },
  }
})

import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Public origin of the deployed web app, used for canonical/OG URLs in
// index.html and for robots.txt + sitemap.xml. No trailing slash.
const DEFAULT_SITE_URL = 'https://chorgie.app'

// Only the public marketing/auth pages belong in search results; everything
// behind login is disallowed here and also marked noindex at runtime.
const PUBLIC_PATHS = ['/', '/register', '/login']
const PRIVATE_PATHS = ['/admin', '/chores', '/requests', '/history', '/super-admin']

function seoFiles(siteUrl) {
  return {
    name: 'chorgie-seo-files',
    generateBundle() {
      const robots = [
        'User-agent: *',
        ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
        '',
      ].join('\n')
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...PUBLIC_PATHS.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`),
        '</urlset>',
        '',
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
  // Make the resolved value available to index.html's %VITE_SITE_URL%.
  process.env.VITE_SITE_URL = siteUrl
  return {
    plugins: [react(), seoFiles(siteUrl)],
    preview: {
      historyApiFallback: true,
    },
  }
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
    // Re-visiting a tab within 30 s is instant (client router cache); edits still refresh via revalidatePath
    staleTimes: { dynamic: 30 },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig

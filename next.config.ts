import type { NextConfig } from "next";

function resolveSupabaseRemotePattern() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      pathname: '/storage/v1/object/public/**',
    }
  } catch {
    return null
  }
}

const supabaseRemotePattern = resolveSupabaseRemotePattern()

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: supabaseRemotePattern
    ? {
        remotePatterns: [supabaseRemotePattern],
      }
    : undefined,
};

export default nextConfig;

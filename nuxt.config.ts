// Nuxt 3 / Nitro config
export default defineNuxtConfig({
  nitro: {
    preset: 'node-server'
  },
  runtimeConfig: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    codeSecret: process.env.CODE_SECRET || 'dev-secret-change-me'
  },
  typescript: {
    strict: true
  }
})

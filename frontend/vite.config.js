import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
<<<<<<< HEAD
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:8080/Jette-Yak', changeOrigin: true } } },
})
=======

// https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
>>>>>>> d61679075dbb21ddcb46ef43fc790d09562deb25

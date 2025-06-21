// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/attendance/',    // 저장소 이름과 일치
  plugins: [react()],
  build: {

    outDir: 'docs',        // ← dist 대신 docs 로
    emptyOutDir: true,     // 기존 docs 폴더를 빌드 전에 비워 줌
  },
});

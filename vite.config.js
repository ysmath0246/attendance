import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/attendance/', // ← 반드시 저장소 이름과 일치
  plugins: [react()],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // 🔥 เพิ่มอันนี้ (สำคัญสุด)
    port: 3000,
    strictPort: true,    // กัน port เปลี่ยนเอง
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
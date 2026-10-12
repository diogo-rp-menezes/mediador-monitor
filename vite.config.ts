import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'frontend',
  base: '/app/',
  plugins: [vue()],
  build: {outDir: '../web/vue',emptyOutDir: true}
});

import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],build:{outDir:'dist',rollupOptions:{output:{manualChunks:{editor:['@uiw/react-codemirror','@codemirror/lang-javascript','@codemirror/lang-json','@codemirror/lang-python','@codemirror/lang-html','@codemirror/lang-css','@codemirror/lang-markdown'],terminal:['@xterm/xterm','@xterm/addon-fit'],react:['react','react-dom'],markdown:['marked','dompurify']}}}}});

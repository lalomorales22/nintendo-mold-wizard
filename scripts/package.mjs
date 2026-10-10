import { copyFile, writeFile } from 'node:fs/promises'
await copyFile('server/api.php', 'dist/api.php')
await writeFile('dist/.htaccess', `Options -Indexes\n<FilesMatch "^\\.">\n  Require all denied\n</FilesMatch>\n<IfModule mod_headers.c>\n  Header always set X-Content-Type-Options nosniff\n  Header always set Referrer-Policy no-referrer\n</IfModule>\n`)
console.log('PHP deployment ready in dist/. Keep .env and .moldforge outside the public directory.')

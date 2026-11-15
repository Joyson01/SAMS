process.env.DEV_HTTPS = 'true';
const { createServer } = await import('vite');
const server = await createServer({ server: { host: '0.0.0.0' } });
await server.listen();
server.printUrls();

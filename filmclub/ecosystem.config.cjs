module.exports = {
  apps: [
    {
      name: "filmclub-api",
      cwd: "./apps/api",
      script: "./dist/apps/api/src/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        API_PORT: 4000
      }
    },
    {
      name: "filmclub-web",
      cwd: "./apps/web",
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://api.spoon.studio"
      }
    }
  ]
};


module.exports = {
  apps: [
    {
      name: "filmclub-api",
      cwd: "./apps/api",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        API_PORT: 4000
      }
    },
    {
      name: "filmclub-web",
      cwd: "./apps/web",
      script: "npm",
      args: "run start -- -p 3000",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://api.filmclub.spoon.studio"
      }
    }
  ]
};

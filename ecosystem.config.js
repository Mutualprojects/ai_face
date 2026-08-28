module.exports = {
  apps: [
    {
      name: "sentinel-backend",
      script: "/root/vmslatest/facial_recognistion/Backend/venv/bin/gunicorn",
      args: "-c gunicorn.conf.py app:app",
      interpreter: "none",
      cwd: "/root/vmslatest/facial_recognistion/Backend",
      env: {
        PORT: 5000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "INFO",
      },
      max_memory_restart: "2G",
      exp_backoff_restart_delay: 100,
    },
    {
      name: "sentinel-frontend",
      script: "/root/vmslatest/facial_recognistion/front_end/node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/root/vmslatest/facial_recognistion/front_end",
      env: {
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 100,
    },
  ],
};

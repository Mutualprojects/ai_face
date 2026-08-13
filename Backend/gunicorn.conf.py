import multiprocessing
import os

workers = 1
worker_class = "gthread"
threads = 8
timeout = 0
graceful_timeout = 30
keepalive = 5
max_requests = 0

preload_app = True
chdir = os.path.dirname(os.path.abspath(__file__))

host = os.getenv("HOST", "0.0.0.0")
port = os.getenv("PORT", "5000")
bind = f"{host}:{port}"

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")

proc_name = "sentinel-backend"

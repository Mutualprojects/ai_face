"""Structured logging for the Sentinel engine.

Writes human-readable console output plus optional JSON lines to a
rotating file so production logs stay bounded and machine-parseable.
"""

import json
import logging
import sys
import time
from logging.handlers import RotatingFileHandler

from .config import Config

_CONFIGURED = False
_LOG = logging.getLogger("sentinel")


def _json_record_factory(factory):
    class JsonFormatter(logging.Formatter):
        def format(self, record):
            payload = {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(record.created)),
                "ms": int(record.msecs),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            for key in ("camera_id", "person_name", "confidence", "event", "model"):
                val = getattr(record, key, None)
                if val is not None:
                    payload[key] = val
            if record.exc_info:
                payload["exc"] = self.formatException(record.exc_info)
            return json.dumps(payload)

    return JsonFormatter


def setup_logging():
    global _CONFIGURED
    if _CONFIGURED:
        return _LOG

    root = logging.getLogger()
    root.setLevel(getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO))

    for handler in list(root.handlers):
        root.removeHandler(handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(console)

    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        Config.LOG_DIR / "sentinel.log",
        maxBytes=Config.LOG_MAX_BYTES,
        backupCount=Config.LOG_BACKUPS,
    )
    if Config.LOG_JSON:
        file_handler.setFormatter(_json_record_factory(None)())
    else:
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
    root.addHandler(file_handler)

    _CONFIGURED = True
    return _LOG


def get_logger(name="sentinel"):
    setup_logging()
    return logging.getLogger(name)

"""Logging configuration for the Sentinel backend.

Console output identical to the original app.py basicConfig format.
Safe to call repeatedly (idempotent) and safe under gunicorn workers.
"""

import logging
import os
import sys

_CONFIGURED = False


def setup_logging() -> logging.Logger:
    """Configure the root logger once and return the 'sentinel' logger."""
    global _CONFIGURED
    if not _CONFIGURED:
        level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
        logging.basicConfig(
            level=level,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            stream=sys.stderr,
        )
        # Quiet the very chatty third-party loggers so LOG_LEVEL=DEBUG stays usable.
        for noisy in ("urllib3", "werkzeug"):
            logging.getLogger(noisy).setLevel(max(level, logging.WARNING))
        _CONFIGURED = True
    return logging.getLogger("sentinel")


def get_logger(name: str = "sentinel") -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)

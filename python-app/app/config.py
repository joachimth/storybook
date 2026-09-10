import yaml
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env", override=False)
except ImportError:
    pass  # python-dotenv optional

_ROOT = Path(__file__).parent.parent


def load_config():
    config_path = _ROOT / "config.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    # Env vars override config file (required for API key in production)
    env_key = os.environ.get("OPENAI_API_KEY", "")
    if env_key:
        cfg["openai_api_key"] = env_key

    env_name = os.environ.get("DEFAULT_NAME", "")
    if env_name:
        cfg["default_barnets_navn"] = env_name

    return cfg


CONFIG = load_config()

_openai_client = None


def get_openai_client():
    """Lazy OpenAI client - only instantiated on first actual API call."""
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=CONFIG["openai_api_key"])
    return _openai_client

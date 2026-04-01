#!/usr/bin/env python3
"""Start the Stripe MCP server using local Stripe CLI credentials."""

from __future__ import annotations

import os
import pathlib
import sys
import tomllib


CONFIG_PATH = pathlib.Path.home() / ".config" / "stripe" / "config.toml"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    return tomllib.loads(CONFIG_PATH.read_text())


def resolve_api_key(config: dict) -> str | None:
    env_key = os.environ.get("STRIPE_SECRET_KEY")
    if env_key:
        return env_key

    profile = os.environ.get("STRIPE_PROFILE", "default")
    mode = os.environ.get("STRIPE_MODE", "test").lower()
    profile_config = config.get(profile, {}) if isinstance(config, dict) else {}

    if mode == "live":
        return profile_config.get("live_mode_api_key")

    return profile_config.get("test_mode_api_key")


def main() -> int:
    config = load_config()
    api_key = resolve_api_key(config)

    if not api_key:
        sys.stderr.write(
            "stripe-mcp: missing Stripe API key. "
            "Set STRIPE_SECRET_KEY or configure ~/.config/stripe/config.toml.\n"
        )
        return 1

    if "--check" in sys.argv[1:]:
        profile = os.environ.get("STRIPE_PROFILE", "default")
        mode = os.environ.get("STRIPE_MODE", "test").lower()
        sys.stdout.write(
            f"stripe-mcp: credentials resolved from profile={profile} mode={mode}\n"
        )
        return 0

    cmd = ["npx", "-y", "@stripe/mcp", f"--api-key={api_key}"]
    stripe_account = os.environ.get("STRIPE_ACCOUNT")
    if stripe_account:
        cmd.append(f"--stripe-account={stripe_account}")

    os.execvp(cmd[0], cmd)


if __name__ == "__main__":
    raise SystemExit(main())

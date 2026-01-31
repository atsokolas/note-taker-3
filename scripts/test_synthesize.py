#!/usr/bin/env python3
import json
import os
import sys
from urllib.request import Request, urlopen


def main() -> int:
    base_url = os.getenv("AI_SERVICE_URL", "https://ai-5q0l.onrender.com").rstrip("/")
    secret = os.getenv("AI_SHARED_SECRET", "")
    if not secret:
        print("AI_SHARED_SECRET is required", file=sys.stderr)
        return 1

    payload = {
        "items": [
            {
                "type": "note",
                "id": "local-test",
                "text": "This is a test note about battery supply chains and pricing strategy.",
            },
            {
                "type": "highlight",
                "id": "local-h1",
                "text": "Key insight: cost advantages compound when manufacturing scale meets local supply chain density.",
            },
        ],
        "prompt": "Give me themes, connections, and 3 questions to think about.",
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        f"{base_url}/synthesize",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-ai-shared-secret": secret,
        },
        method="POST",
    )
    with urlopen(req) as resp:
        body = resp.read().decode("utf-8")
    result = json.loads(body)
    expected_keys = {"themes", "connections", "questions"}
    if set(result.keys()) != expected_keys:
        raise AssertionError(f"unexpected keys: {result.keys()}")
    for key in expected_keys:
        value = result.get(key)
        if not isinstance(value, list) or len(value) != 3:
            raise AssertionError(f"{key} must be a list of 3 strings")
        if not all(isinstance(item, str) for item in value):
            raise AssertionError(f"{key} must contain strings")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

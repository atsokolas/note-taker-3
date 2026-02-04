import unittest

from ai_service import main


class TestSynthesisParsing(unittest.TestCase):
    def test_extract_from_think_block(self):
        text = (
            "<think>reasoning</think>"
            "{\"themes\":[\"a\",\"b\",\"c\"],"
            "\"connections\":[\"d\",\"e\",\"f\"],"
            "\"questions\":[\"g\",\"h\",\"i\"]}"
        )
        parsed = main._parse_and_validate_synthesis(text)
        self.assertEqual(parsed.themes, ["a", "b", "c"])
        self.assertEqual(parsed.connections, ["d", "e", "f"])
        self.assertEqual(parsed.questions, ["g", "h", "i"])

    def test_extract_from_json_fence(self):
        text = (
            "```json\n"
            "{\"themes\":[\"a\",\"b\",\"c\"],"
            "\"connections\":[\"d\",\"e\",\"f\"],"
            "\"questions\":[\"g\",\"h\",\"i\"]}\n"
            "```"
        )
        parsed = main._parse_and_validate_synthesis(text)
        self.assertEqual(parsed.themes, ["a", "b", "c"])

    def test_extract_from_wrapped_text(self):
        text = (
            "Here you go:\n"
            "{\"themes\":[\"a\",\"b\",\"c\"],"
            "\"connections\":[\"d\",\"e\",\"f\"],"
            "\"questions\":[\"g\",\"h\",\"i\"]}"
            "\nThanks!"
        )
        parsed = main._parse_and_validate_synthesis(text)
        self.assertEqual(parsed.questions, ["g", "h", "i"])


class TestSynthesizeIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_synthesize_repairs_invalid_output(self):
        original_chat = main.hf_chat_complete
        original_config = main.get_hf_config
        calls = {"count": 0}

        async def fake_chat_complete(*args, **kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                return {
                    "model": "fake",
                    "text": "<think>bad</think>not json",
                    "method": "chat",
                    "url": "http://fake",
                    "status": 200,
                    "body": {},
                }
            return {
                "model": "fake",
                "text": "{\"themes\":[\"a\",\"b\",\"c\"],"
                        "\"connections\":[\"d\",\"e\",\"f\"],"
                        "\"questions\":[\"g\",\"h\",\"i\"]}",
                "method": "chat",
                "url": "http://fake",
                "status": 200,
                "body": {},
            }

        def fake_get_hf_config():
            return {
                "token": "fake-token",
                "embedding_model": "fake-embed",
                "text_model": "fake-model",
                "base_url": "https://router.huggingface.co/hf-inference/models",
                "router_base_url": "https://router.huggingface.co/v1",
                "timeout_ms": 1000,
            }

        try:
            main.hf_chat_complete = fake_chat_complete
            main.get_hf_config = fake_get_hf_config
            req = main.SynthesizeRequest(
                items=[main.SynthesizeItem(type="note", id="1", text="hello")]
            )
            result = await main.synthesize(req)
            self.assertEqual(result["themes"], ["a", "b", "c"])
            self.assertEqual(result["connections"], ["d", "e", "f"])
            self.assertEqual(result["questions"], ["g", "h", "i"])
        finally:
            main.hf_chat_complete = original_chat
            main.get_hf_config = original_config

    async def test_synthesize_fallback_on_unparseable_output(self):
        original_chat = main.hf_chat_complete
        original_config = main.get_hf_config
        calls = {"count": 0}

        async def fake_chat_complete(*args, **kwargs):
            calls["count"] += 1
            return {
                "model": "fake",
                "text": "<think>bad</think>not json",
                "method": "chat",
                "url": "http://fake",
                "status": 200,
                "body": {},
            }

        def fake_get_hf_config():
            return {
                "token": "fake-token",
                "embedding_model": "fake-embed",
                "text_model": "fake-model",
                "base_url": "https://router.huggingface.co/hf-inference/models",
                "router_base_url": "https://router.huggingface.co/v1",
                "timeout_ms": 1000,
            }

        try:
            main.hf_chat_complete = fake_chat_complete
            main.get_hf_config = fake_get_hf_config
            req = main.SynthesizeRequest(
                items=[main.SynthesizeItem(type="note", id="1", text="hello")]
            )
            result = await main.synthesize(req)
            self.assertEqual(result["warning"], "invalid_json")
            self.assertEqual(len(result["themes"]), 3)
            self.assertEqual(result["themes"][0], "(AI unavailable)")
        finally:
            main.hf_chat_complete = original_chat
            main.get_hf_config = original_config

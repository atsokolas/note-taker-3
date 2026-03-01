import unittest

from ai_service import main


class TestHFModelsParsing(unittest.TestCase):
    def test_model_provider_support_accepts_openai_style_list_payload(self):
        payload = {
            "object": "list",
            "data": [
                {
                    "id": "Qwen/Qwen3.5-27B",
                    "providers": [{"provider": "novita"}],
                }
            ],
        }
        support = main._model_provider_support(payload, "Qwen/Qwen3.5-27B", "novita")
        self.assertEqual(support, {"found": True, "supported": True})


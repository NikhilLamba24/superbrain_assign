import pytest

from app.core.config import settings
from app.core.errors import GenerationError
from app.services.image_generation_service import ImageGenerationService


def test_mock_generation_returns_svg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "together_mock", True)
    data, content_type = ImageGenerationService().generate("A diver discovers an ancient city")
    assert content_type == "image/svg+xml"
    assert b"<svg" in data


def test_generation_without_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "together_mock", False)
    monkeypatch.setattr(settings, "together_api_key", "")
    with pytest.raises(GenerationError):
        ImageGenerationService().generate("anything")

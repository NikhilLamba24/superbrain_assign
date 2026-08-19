import xml.sax.saxutils as saxutils

import httpx

from ..core.config import settings
from ..core.errors import GenerationError


class ImageGenerationService:
    """Server-side image generation via Together AI (FLUX).

    Real mode calls POST {together_api_url}/images/generations and downloads the
    returned image. Mock mode (TOGETHER_MOCK=1) returns a local SVG placeholder so
    the full pipeline can be exercised without an API key.
    """

    def __init__(self, client: httpx.Client | None = None):
        self._client = client or httpx.Client(timeout=settings.together_timeout_seconds)

    def generate(self, prompt: str) -> tuple[bytes, str]:
        """Return (image_bytes, content_type)."""
        if settings.together_mock:
            return self._mock(prompt)
        if not settings.together_api_key:
            raise GenerationError(
                "Image generation is not configured. Set TOGETHER_API_KEY (or TOGETHER_MOCK=1 for local dev)."
            )

        try:
            resp = self._client.post(
                f"{settings.together_api_url}/images/generations",
                headers={"Authorization": f"Bearer {settings.together_api_key}"},
                json={
                    "model": settings.together_image_model,
                    "prompt": prompt,
                    "disable_safety_checker": True,
                    "n": 1,
                },
            )
        except httpx.TimeoutException as exc:
            raise GenerationError("Image generation timed out. Please try again.") from exc
        except httpx.HTTPError as exc:
            raise GenerationError("Image generation failed. Please try again.") from exc

        if resp.status_code != 200:
            raise GenerationError("Image generation failed. Please try again.")

        try:
            image_url = resp.json()["data"][0]["url"]
        except (KeyError, IndexError, ValueError) as exc:
            raise GenerationError("Image generation returned an invalid response.") from exc

        try:
            image_resp = self._client.get(image_url)
        except httpx.HTTPError as exc:
            raise GenerationError("Could not download the generated image.") from exc
        if image_resp.status_code != 200:
            raise GenerationError("Could not download the generated image.")

        return image_resp.content, _sniff_content_type(image_resp.content)

    def _mock(self, prompt: str) -> tuple[bytes, str]:
        safe = saxutils.escape(prompt)
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>"
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
            "<stop offset='0' stop-color='#0f2027'/><stop offset='0.5' stop-color='#203a43'/>"
            "<stop offset='1' stop-color='#2c5364'/></linearGradient></defs>"
            "<rect width='1024' height='1024' fill='url(#g)'/>"
            "<text x='512' y='470' font-family='sans-serif' font-size='40' fill='#e2e8f0' "
            f"text-anchor='middle'>{safe}</text>"
            "<text x='512' y='530' font-family='sans-serif' font-size='22' fill='#94a3b8' "
            "text-anchor='middle'>mock generation (TOGETHER_MOCK=1)</text>"
            "</svg>"
        )
        return svg.encode("utf-8"), "image/svg+xml"


def _sniff_content_type(data: bytes) -> str:
    """Detect the image type from magic bytes rather than trusting the download's
    content-type header (Together's CDN can return octet-stream)."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if b"<svg" in data[:512]:
        return "image/svg+xml"
    return "application/octet-stream"

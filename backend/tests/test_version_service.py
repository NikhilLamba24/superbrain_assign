from app.services.version_service import display_version


def test_display_version_format() -> None:
    assert display_version("blackhorse", 1) == "blackhorse_v1"
    assert display_version("whiterabbit", 12) == "whiterabbit_v12"

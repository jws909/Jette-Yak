"""기존 제때약 로고를 설치용 아이콘으로 내보내기: Python + Pillow 필요."""
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
TARGET = PUBLIC / "pwa"
BACKGROUND = "#f7f4ee"


def make_icon(logo: Image.Image, size: int, content_ratio: float) -> Image.Image:
    # 원본의 투명 여백만 제거하고 비율 유지; 마스커블 아이콘은 중앙 안전 영역 안에 배치
    content = logo.copy()
    content.thumbnail((round(size * content_ratio), round(size * content_ratio)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    canvas.alpha_composite(content, ((size - content.width) // 2, (size - content.height) // 2))
    return canvas.convert("RGB")


def main() -> None:
    TARGET.mkdir(exist_ok=True)
    with Image.open(PUBLIC / "logo.png") as source:
        rgba = source.convert("RGBA")
        logo = rgba.crop(rgba.getchannel("A").getbbox())
    for filename, size, ratio in (
        ("icon-192.png", 192, 0.68),
        ("icon-512.png", 512, 0.68),
        ("maskable-512.png", 512, 0.56),
        ("apple-touch-icon.png", 180, 0.68),
    ):
        make_icon(logo, size, ratio).save(TARGET / filename, optimize=True)
    make_icon(logo, 64, 0.80).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])


if __name__ == "__main__":
    main()

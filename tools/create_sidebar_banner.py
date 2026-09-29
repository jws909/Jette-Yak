from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(r"C:\study-8\teamProject\3rdProject\Jette-Yak")
BACKGROUND = Path(
    r"C:\Users\sudal\.codex\generated_images\01a0a3f5-0615-7ca2-be9d-814cebab9e05\exec-a234734a-9ba2-40a2-b673-321eeb28abb1.png"
)
LOGO = ROOT / "frontend" / "src" / "assets" / "logo.png"
OUTPUT = ROOT / "frontend" / "public" / "banners"

BURGUNDY = "#8B3E4B"
DEEP_BURGUNDY = "#732F3C"
INK = "#302C29"
MUTED = "#74665E"
CREAM = "#FAF7F2"
WHITE = "#FFFDFC"
FONT_REGULAR = str(ROOT / "tools" / "banner-fonts" / "Katuri.woff")
FONT_BOLD = FONT_REGULAR


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, size: int, bold: bool = False):
    while size > 10:
        candidate = font(size, bold)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= max_width:
            return candidate
        size -= 1
    return font(10, bold)


def make_banner() -> Image.Image:
    bg = Image.open(BACKGROUND).convert("RGB").resize((600, 1200), Image.Resampling.LANCZOS)
    bg = ImageEnhance.Color(bg).enhance(0.96)
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")

    # The quiet top is softened to keep small-format type crisp and readable.
    for y in range(0, 470):
        alpha = int(38 * (1 - y / 470))
        draw.rectangle((0, y, 600, y + 1), fill=(250, 247, 242, alpha))

    logo = Image.open(LOGO).convert("RGBA")
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    logo.thumbnail((64, 58), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (55, 48))

    # Use the same Eommakkaturi (Katuri.woff) typeface as the website.
    draw.text((134, 45), "제때약", font=font(54, True), fill=DEEP_BURGUNDY)
    draw.text(
        (55, 126),
        "PERSONAL MEDICATION CARE",
        font=font(14, True),
        fill=BURGUNDY,
        stroke_width=0,
    )
    draw.rounded_rectangle((55, 157, 273, 198), radius=20, fill=BURGUNDY)
    draw.text((75, 164), "제때약과 만드는 복약 습관", font=font(16, True), fill=WHITE)

    headline_1 = "내 약을 제때,"
    headline_2 = "더 안전하게"
    draw.text((55, 221), headline_1, font=fit_font(draw, headline_1, 490, 58, True), fill=INK)
    draw.text((55, 292), headline_2, font=fit_font(draw, headline_2, 490, 58, True), fill=BURGUNDY)

    draw.text((58, 383), "복약 일정부터 AI 상담까지", font=font(25, True), fill=INK)
    draw.text((58, 427), "나와 가족의 약을 한곳에서 관리하세요.", font=font(19), fill=MUTED)

    # Bottom CTA remains readable even after reducing the ad to 300 x 600.
    draw.rounded_rectangle((55, 1084, 545, 1160), radius=20, fill=DEEP_BURGUNDY)
    cta = "제때약 바로가기  →"
    cta_font = font(27, True)
    cta_box = draw.textbbox((0, 0), cta, font=cta_font)
    cta_x = (600 - (cta_box[2] - cta_box[0])) // 2
    draw.text((cta_x, 1103), cta, font=cta_font, fill=WHITE)

    return canvas.convert("RGB")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = make_banner()
    source_png = OUTPUT / "jette-yak-sidebar-banner-600x1200.png"
    source_webp = OUTPUT / "jette-yak-sidebar-banner-600x1200.webp"
    display_png = OUTPUT / "jette-yak-sidebar-banner-300x600.png"
    display_webp = OUTPUT / "jette-yak-sidebar-banner-300x600.webp"

    source.save(source_png, format="PNG", optimize=True)
    source.save(source_webp, format="WEBP", quality=94, method=6)
    display = source.resize((300, 600), Image.Resampling.LANCZOS)
    display.save(display_png, format="PNG", optimize=True)
    display.save(display_webp, format="WEBP", quality=92, method=6)

    for path in (source_png, source_webp, display_png, display_webp):
        with Image.open(path) as image:
            print(f"{path.name}: {image.size[0]}x{image.size[1]} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()

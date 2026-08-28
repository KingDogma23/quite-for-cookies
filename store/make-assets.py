"""
Store artwork for Quite for Cookies, drawn rather than photographed.

Everything is rendered at 2x and downsampled once at save. The first version
drew at 1:1 and the small type came out cramped — SFNS gives a space an advance
of 2px at 10px, so labels like "SITE DATA" closed up into "SITEDATA". Drawing at
2x gives it 4px and the downsample restores the antialiasing.

The other lesson in here: SFNS is a variable font whose axes are Width, Optical
Size, GRAD, Weight — in that order. Calling set_variation_by_axes([700]) sets
WIDTH to maximum, which is how the first run produced ultra-wide type and digits
that looked like rings. Named instances only.

Numbers shown are real. The per-site panel is a measured bbc.co.uk scan from
2026-08-27, and the ALL TIME row is the extension's own totals from that day's
use. Nothing here is invented, on a listing whose claim is that it tells you the
truth about what it deleted.
"""
from PIL import Image, ImageDraw, ImageFont

K = 2                                   # supersampling factor
SF = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"
GROUND, CARD, SUNK = "#0f151b", "#141c24", "#1a242e"
LINE, FG, MUTED, DIM = "#253039", "#eef3f8", "#94a6b5", "#c9d6e0"
BLUE, AMBER, AMBER_BG = "#55a8e8", "#e0a341", "#2a2113"

STATS = [("357", "Cookies removed"), ("45", "Data items cleared"), ("228", "Sites cleaned")]

WEIGHTS = {400: "Regular", 500: "Medium", 560: "Medium", 600: "Semibold",
           620: "Semibold", 650: "Semibold", 680: "Bold", 700: "Bold"}
_fonts = {}

def f(size, weight=400, mono=False):
    key = (round(size * K), weight, mono)
    if key not in _fonts:
        font = ImageFont.truetype(MONO if mono else SF, round(size * K))
        if not mono:
            try:
                font.set_variation_by_name(WEIGHTS.get(weight, "Regular"))
            except Exception:
                pass
        _fonts[key] = font
    return _fonts[key]


class Scaled:
    """Draw in logical units onto a 2x surface. Keeps every coordinate readable."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _p(self, box):
        return [v * K for v in box]

    def rectangle(self, box, **kw):
        self.d.rectangle(self._p(box), **kw)

    def rounded_rectangle(self, box, radius=0, **kw):
        self.d.rounded_rectangle(self._p(box), radius=radius * K, **kw)

    def ellipse(self, box, width=None, **kw):
        if width is not None:
            kw["width"] = max(1, round(width * K))
        self.d.ellipse(self._p(box), **kw)

    def line(self, box, width=1, **kw):
        self.d.line(self._p(box), width=max(1, round(width * K)), **kw)

    def text(self, xy, s, font, fill, anchor="la"):
        self.d.text([xy[0] * K, xy[1] * K], s, font=font, fill=fill, anchor=anchor)

    def textlength(self, s, font):
        return self.d.textlength(s, font=font) / K

    def fit(self, s, font, max_w):
        if self.textlength(s, font) <= max_w:
            return s
        while s and self.textlength(s + "…", font) > max_w:
            s = s[:-1]
        return s + "…"


def canvas(w, h, colour):
    img = Image.new("RGB", (w * K, h * K), colour)
    return img, Scaled(img)


def tick(d, x, y, on):
    d.rounded_rectangle([x, y, x + 10, y + 10], radius=2,
                        fill=BLUE if on else None, outline=BLUE if on else MUTED)
    if on:
        d.line([x + 2.5, y + 5, x + 4.5, y + 7.5], fill=CARD, width=1.6)
        d.line([x + 4.5, y + 7.5, x + 8, y + 2.5], fill=CARD, width=1.6)


def stats_block(d, w, y):
    d.rectangle([0, y, w, y + 62], fill=SUNK)
    d.text((w / 2, y + 9), "ALL TIME, EVERY SITE", f(9, 500), MUTED, "ma")
    for i, (n, lab) in enumerate(STATS):
        cx = w / 6 + i * w / 3
        d.text((cx, y + 23), n, f(20, 700), FG, "ma")
        d.text((cx, y + 47), lab, f(9), MUTED, "ma")
    return y + 62


def row(d, w, y, name, meta, on, tag=None):
    tick(d, 16, y + 12, on)
    d.text((36, y + 9), name, f(11.5, 500, mono=True), FG)
    if tag:
        tx = 36 + d.textlength(name, f(11.5, 500, mono=True)) + 8
        tw = d.textlength(tag, f(9, 600))
        d.rounded_rectangle([tx, y + 9, tx + tw + 12, y + 24], radius=4, fill=AMBER_BG)
        d.text((tx + 6, y + 12), tag, f(9, 600), AMBER)
    d.text((36, y + 27), d.fit(meta, f(10.5), w - 52), f(10.5), MUTED)
    d.line([0, y + 46, w, y + 46], fill=LINE)
    return y + 47


def header(d, w, title, sub, tabs=None):
    d.text((16, 16), title, f(15, 700), FG)
    d.text((16, 36), sub, f(11.5), MUTED)
    y = 58
    d.line([0, y, w, y], fill=LINE)
    y += 1
    if tabs:
        for i, label in enumerate(tabs):
            cx = w / 4 + i * w / 2
            active = i == tabs.index(tabs[-1]) if False else (i == 1)
            d.text((cx, y + 8), label, f(11.5, 560), FG if active else MUTED, "ma")
            if active:
                d.line([w / 2, y + 29, w, y + 29], fill=BLUE, width=2)
        y += 31
        d.line([0, y, w, y], fill=LINE)
        y += 1
    return y


def popup(w=320):
    img, d = canvas(w, 640, CARD)
    y = header(d, w, "bbc.co.uk", "22 cookies across 3 domains")
    y = stats_block(d, w, y)

    d.rectangle([0, y, w, y + 40], fill=AMBER_BG)
    d.text((16, y + 8), "Keeping the cookies that hold your sign-in,", f(10.5), AMBER)
    d.text((16, y + 22), "so you'll stay logged in to bbc.co.uk.", f(10.5), AMBER)
    y += 40

    d.rectangle([0, y, w, y + 20], fill=SUNK)
    d.text((16, y + 5), "COOKIES", f(9.5, 600), MUTED)
    y += 20

    y = row(d, w, y, ".bbc.co.uk", "17 cookies · 3.7 KB", False, "2 sign-in")
    y = row(d, w, y, "www.bbc.co.uk", "3 cookies · 123 B", True)
    y = row(d, w, y, ".session.bbc.co.uk", "2 cookies · 3.0 KB", False, "2 sign-in")

    d.rectangle([0, y, w, y + 20], fill=SUNK)
    d.text((16, y + 5), "SITE DATA", f(9.5, 600), MUTED)
    y += 20
    y = row(d, w, y, "www.bbc.co.uk", "46 items local storage (9.7 KB) · 4 caches", True)

    y += 8
    lead, site, action = "Can read cookies on ", "bbc.co.uk", "Allow every site"
    d.text((16, y), lead, f(10.5), MUTED)
    d.text((16 + d.textlength(lead, f(10.5)), y), site, f(10.5, 700), FG)
    d.text((w - 16, y), action, f(10.5, 600), BLUE, "ra")
    y += 24

    d.rounded_rectangle([16, y, w - 16, y + 36], radius=9, fill=BLUE)
    d.text((w / 2, y + 10), "Remove 5 cookies and site data", f(12, 620), "#0f1720", "ma")
    return img.crop((0, 0, w * K, (y + 52) * K))


def popup_all(w=320):
    img, d = canvas(w, 700, CARD)
    y = header(d, w, "Every site", "885 cookies across 296 sites", ["This site", "Every site"])
    y = stats_block(d, w, y)

    d.rectangle([0, y, w, y + 66], fill=CARD)
    d.ellipse([16, y + 12, 26, y + 22], outline=BLUE, width=1.5, fill=BLUE)
    d.ellipse([18.5, y + 14.5, 23.5, y + 19.5], fill=CARD)
    d.text((36, y + 10), "Trackers only — 214 cookies", f(12.5, 700), FG)
    d.text((36, y + 27), "Advertising and analytics cookies, matched against", f(10.5), MUTED)
    d.text((36, y + 40), "150 tracking domains. It cannot log you out.", f(10.5), MUTED)
    y += 66
    d.line([0, y, w, y], fill=LINE)
    y += 1

    d.rectangle([0, y, w, y + 62], fill=CARD)
    d.ellipse([16, y + 12, 26, y + 22], outline=MUTED, width=1.5)
    d.text((36, y + 10), "Everything — 671 cookies", f(12.5, 700), AMBER)
    d.text((36, y + 27), "Every cookie on every site you haven't spared.", f(10.5), MUTED)
    y += 62

    d.rectangle([0, y, w, y + 20], fill=SUNK)
    d.text((16, y + 5), "SITES", f(9.5, 600), MUTED)
    y += 20
    for name, meta, tag in [
        ("google.com", "84 cookies · 71 to remove, 13 kept", "12 sign-in"),
        ("doubleclick.net", "63 cookies · 63 to remove", None),
        ("taboola.com", "41 cookies · 41 to remove", None),
        ("bbc.co.uk", "22 cookies · 20 to remove, 2 kept", "2 sign-in"),
    ]:
        y = row(d, w, y, name, meta, True, tag)

    y += 10
    d.rounded_rectangle([16, y, w - 16, y + 36], radius=9, fill=BLUE)
    d.text((w / 2, y + 10), "Remove 214 cookies", f(12, 620), "#0f1720", "ma")
    return img.crop((0, 0, w * K, (y + 52) * K))


def popup_proof(w=320):
    img, d = canvas(w, 400, CARD)
    y = header(d, w, "bbc.co.uk", "5 cookies still here")
    y = stats_block(d, w, y) + 14

    for bold, rest in [("17 cookies removed", " of 17 selected."),
                       ("Site data cleared, and confirmed empty.", ""),
                       ("5 cookies left alone, as you asked.", ""),
                       ("Counted after deleting, not assumed from it.", "")]:
        weight = 700 if rest else 400
        colour = FG if rest else MUTED
        d.text((16, y), bold, f(11.5, weight), colour)
        if rest:
            d.text((16 + d.textlength(bold, f(11.5, 700)), y), rest, f(11.5), MUTED)
        y += 26
    return img.crop((0, 0, w * K, (y + 10) * K))


def mark(size):
    img = Image.new("RGBA", (size * K * 4, size * K * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * K * 4 / 48
    d.rounded_rectangle([0, 0, size * K * 4 - 1, size * K * 4 - 1], radius=10.56 * s, fill=CARD)
    d.ellipse([(24 - 11.52) * s, (24 - 11.52) * s, (24 + 11.52) * s, (24 + 11.52) * s],
              outline=BLUE, width=round(5.52 * s))
    d.line([26.04 * s, 26.04 * s, 33.61 * s, 33.61 * s], fill=BLUE, width=round(5.52 * s))
    return img.resize((size * K, size * K), Image.LANCZOS)


def shot(path, headline, bullets, panel):
    W, H = 1280, 800
    img, d = canvas(W, H, GROUND)
    m = mark(56)
    img.paste(m, (90 * K, 92 * K), m)
    d.text((162, 100), "Quite Apps", f(22, 500), MUTED)

    y = 196
    for line in headline:
        d.text((90, y), line, f(52, 700), FG)
        y += 70
    y += 30
    for b in bullets:
        d.ellipse([94, y + 9, 102, y + 17], fill=BLUE)
        d.text((122, y), b, f(19), DIM)
        y += 50

    x = (W - panel.width // K - 92) * K
    py = (H * K - panel.height) // 2
    ImageDraw.Draw(img).rounded_rectangle(
        [x - 12 * K, py - 12 * K, x + panel.width + 12 * K, py + panel.height + 12 * K],
        radius=16 * K, fill="#111a22")
    img.paste(panel, (x, py))
    img.resize((W, H), Image.LANCZOS).save(path)
    return path


def tile(path, size, headline, sub, panel=None):
    W, H = size
    img, d = canvas(W, H, GROUND)
    m = mark(round(H * 0.16))
    img.paste(m, (round(W * 0.07) * K, round(H * 0.14) * K), m)
    x = round(W * 0.07)
    y = round(H * 0.14) + m.height // K + round(H * 0.07)
    d.text((x, y), headline, f(round(H * 0.105), 700), FG)
    d.text((x, y + round(H * 0.15)), sub, f(round(H * 0.052)), MUTED)
    if panel:
        # A panel taller than the tile bleeds off both edges and reads as a
        # cropping accident rather than a design. Scale it to fit with a margin.
        margin = round(H * 0.07) * K
        if panel.height > H * K - 2 * margin:
            scale = (H * K - 2 * margin) / panel.height
            panel = panel.resize((round(panel.width * scale), round(panel.height * scale)), Image.LANCZOS)
        img.paste(panel, (W * K - panel.width - round(W * 0.05) * K, (H * K - panel.height) // 2))
    img.resize((W, H), Image.LANCZOS).save(path)
    return path


print(" ", shot("store/screenshots/01-see-it-before-you-delete-it.png",
                ["See exactly what's", "there. Then delete it."],
                ["Every cookie listed, grouped by who set it",
                 "Sign-in cookies kept unless you say otherwise",
                 "Untick a domain and it is genuinely spared"], popup()))
print(" ", shot("store/screenshots/02-clean-everything-stay-signed-in.png",
                ["Clean every site.", "Stay signed in."],
                ["One sweep across the whole browser",
                 "Trackers only, by default — it cannot log you out",
                 "Sites you protect are remembered"], popup_all()))
print(" ", shot("store/screenshots/03-then-check-that-it-went.png",
                ["Then check", "that it went."],
                ["Counts again after deleting, and reports it",
                 "Says plainly what it could not remove",
                 "No permissions at all until you ask"], popup_proof()))
print(" ", tile("store/promo-tile-440x280.png", (440, 280),
                "Quite for Cookies", "See it before you delete it."))
print(" ", tile("store/marquee-1400x560.png", (1400, 560),
                "Quite for Cookies", "Clean every site. Stay signed in.", popup_all()))

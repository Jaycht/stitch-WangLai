"""
生成应用图标 —— 往来礼记
风格：呼应应用内的「账本」图标（Tab 第1 个），青瓷绿主色 + 米白底。
输出：
  - 各密度 mipmap PNG（方形与圆形两套）
  - 自适应图标的前景层（透明底，安全区内居中）
  - 启动图splash
"""
import os, math
from PIL import Image, ImageDraw

BASE = r"E:\Deployment\WorkBuddy\往来礼记"
RES = os.path.join(BASE, "android", "app", "src", "main", "res")

# 应用主色（青瓷绿）
ACCENT = (183, 46, 40)          # 礼金单红
ACCENT_DARK = (145, 32, 28)     # 加深的暗红
PAPER = (250, 240, 238)          # 暖白微红
CARD = (255, 255, 255)
INK = (28, 36, 32)

# 各密度启动图与图标尺寸
MIPMAP = {
    'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192,
}
SPLASH = {
    'port-mdpi': 320, 'port-hdpi': 480, 'port-xhdpi': 720, 'port-xxhdpi': 960,
    'port-xxxhdpi': 1280,
    'land-mdpi': 480, 'land-hdpi': 720, 'land-xhdpi': 960, 'land-xxhdpi': 1280,
    'land-xxxhdpi': 1600,
}
# 自适应图标前景需要 108dp 画布，安全区是中间 72dp
ADAPTIVE = {
    'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432,
}


def rounded_card(draw, box, radius, fill, outline=None, width=0):
    draw.rounded_rectangle(box, radius=radius, fill=fill,
                           outline=outline, width=width)


def draw_ledger(size, with_bg=True, bg=PAPER, padding_ratio=0.0):
    """画账本图标。size 为最终画布边长。"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size

    if with_bg:
        # 圆角底板
        rounded_card(d, (0, 0, s - 1, s - 1), int(s * 0.22), bg)

    # 内容区（自适应图标要留安全边距）
    pad = int(s * padding_ratio)
    inner = s - pad * 2
    x0, y0 = pad, pad
    # 账本外框
    lw = max(2, int(inner * 0.058))
    bx0, by0 = x0 + int(inner * 0.16), y0 + int(inner * 0.14)
    bx1, by1 = x0 + int(inner * 0.84), y0 + int(inner * 0.86)
    radius = int(inner * 0.10)

    # 卡片底
    rounded_card(d, (bx0, by0, bx1, by1), radius, CARD)

    # 书脊（中缝）
    cx = (bx0 + bx1) // 2
    d.line([(cx, by0 + int(inner * 0.05)), (cx, by1 - int(inner * 0.05))],
           fill=ACCENT, width=lw)

    # 左右两侧的条目线
    line_h = max(2, int(inner * 0.038))
    gap = int(inner * 0.095)
    top = by0 + int(inner * 0.16)
    rows = 3
    for i in range(rows):
        y = top + i * gap
        d.line([(bx0 + int(inner * 0.11), y),
                (cx - int(inner * 0.09), y)],
               fill=ACCENT, width=line_h)
        d.line([(cx + int(inner * 0.09), y),
                (bx1 - int(inner * 0.11), y)],
               fill=ACCENT, width=line_h)

    # 顶部高光（立体感）
    hl = max(1, int(inner * 0.02))
    d.line([(bx0 + int(inner * 0.16), by0 + int(inner * 0.075)),
            (bx1 - int(inner * 0.16), by0 + int(inner * 0.075))],
           fill=ACCENT_DARK, width=hl)

    # 外描边
    rounded_card(d, (bx0, by0, bx1, by1), radius, None, ACCENT, lw)
    return img


def make_circle(img):
    """把方形图标裁成圆形（Android 圆形图标用）"""
    size = img.width
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


# ---------- 输出 mipmap ----------
for dens, size in MIPMAP.items():
    d = os.path.join(RES, f'mipmap-{dens}')
    os.makedirs(d, exist_ok=True)
    icon = draw_ledger(size)
    icon.save(os.path.join(d, 'ic_launcher.png'))
    make_circle(icon).save(os.path.join(d, 'ic_launcher_round.png'))
    print(f'  mipmap-{dens}: {size}x{size}')

# ---------- 输出自适应图标前景（108dp，安全区内缩） ----------
for dens, size in ADAPTIVE.items():
    d = os.path.join(RES, f'mipmap-{dens}')
    fg = draw_ledger(size, with_bg=False, padding_ratio=0.16)
    # 自适应图标前景不画自己的底，背景色由 XML 里定义
    fg.save(os.path.join(d, 'ic_launcher_foreground.png'))
    print(f'  自适应前景-{dens}: {size}x{size}')

# ---------- 启动图 ----------
for key, w in SPLASH.items():
    dens = key.split('-', 1)[1]
    portrait = key.startswith('port')
    h = int(w * (1.6 if portrait else 0.6))
    d = os.path.join(RES, f'drawable-{key}')
    os.makedirs(d, exist_ok=True)
    img = Image.new('RGB', (w, h), PAPER)
    dr = ImageDraw.Draw(img)
    # 中间放账本图标
    s = int(min(w, h) * 0.22)
    icon = draw_ledger(s, with_bg=False)
    img.paste(icon, ((w - s) // 2, (h - s) // 2 - int(h * 0.04)), icon)
    img.save(os.path.join(d, 'splash.png'))
    print(f'  splash-{key}: {w}x{h}')

print('\n完成')
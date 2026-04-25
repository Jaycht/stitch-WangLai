"""
往来礼记 APP 图标处理脚本（纯 PIL，无需下载模型）
1. 红色背景颜色抠图
2. iOS 圆角风格
"""
from PIL import Image, ImageDraw
import os, shutil

INPUT_PATH = r"E:\Deployment\WorkBuddy\往来礼记\icon.png"
OUTPUT_DIR = r"E:\Deployment\WorkBuddy\往来礼记\android\app\src\main\res"

ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def remove_red_background(input_path, red_thresh=60, sat_thresh=0.4):
    """
    根据颜色抠除红色背景
    原理：检测高饱和度红色区域 → 设为透明
    """
    print("[1/2] 正在抠除红色背景...")
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # 判断是否为红色背景：红色通道高，饱和度高
            if r > red_thresh and g < 120 and b < 120:
                # 计算饱和度
                max_c = max(r, g, b)
                min_c = min(r, g, b)
                sat = (max_c - min_c) / 255.0 if max_c > 0 else 0
                if sat > sat_thresh:
                    pixels[x, y] = (r, g, b, 0)  # 透明

    print("[OK] 背景已去除")
    return img


def add_ios_rounded_corners(img, radius_pct=0.22):
    """添加 iOS 风格圆角"""
    w, h = img.size
    radius = int(min(w, h) * radius_pct)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=radius, fill=255)
    result = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)
    return result


def create_icon(input_path, output_dir):
    no_bg = remove_red_background(input_path)

    # 清理旧的 mipmap 文件夹
    for folder in ICON_SIZES.keys():
        folder_path = os.path.join(output_dir, folder)
        if os.path.exists(folder_path):
            shutil.rmtree(folder_path)
        os.makedirs(folder_path, exist_ok=True)

    for folder, size in ICON_SIZES.items():
        resized = no_bg.resize((size, size), Image.LANCZOS)
        rounded = add_ios_rounded_corners(resized, radius_pct=0.22)
        out_path = os.path.join(output_dir, folder, "ic_launcher.png")
        rounded.save(out_path, "PNG")
        print(f"[OK] {folder}/ic_launcher.png ({size}x{size})")

    # 预览图
    large = no_bg.resize((512, 512), Image.LANCZOS)
    large_rounded = add_ios_rounded_corners(large, radius_pct=0.22)
    large_rounded.save(r"E:\Deployment\WorkBuddy\往来礼记\icon_preview.png", "PNG")
    print("[OK] icon_preview.png (512x512, 预览用)")

    no_bg.save(r"E:\Deployment\WorkBuddy\往来礼记\icon_nobg.png", "PNG")
    print("[OK] icon_nobg.png (透明背景原图)")

    print("\n[ALL DONE]")


if __name__ == "__main__":
    create_icon(INPUT_PATH, OUTPUT_DIR)

#!/usr/bin/env python3
"""
Gera o ícone do widget (bandeja de widgets do KDE) a partir do pet Tux.

O desenho é a versão "pixel-art" do Tux do pacote
(package/contents/ui/pets/tux/spritesheet.webp, quadro idle 0), redesenhada
numa grade 25x33 para ficar legível em tamanhos pequenos.

Saída:
  icons/hicolor/scalable/apps/opencode-assistant.svg
  icons/hicolor/<n>x<n>/apps/opencode-assistant.png   (16..256)
  package/contents/icons/opencode-assistant.svg       (cópia dentro do pacote)

Uso:
  python3 scripts/gen-icon.py          # SVG + PNGs (PNG exige Pillow)
  python3 scripts/gen-icon.py --svg    # apenas SVG (sem dependências)
"""
import os
import sys
import shutil

ART_W, ART_H = 25, 33
CANVAS = 33          # tela quadrada: 4 unidades de margem lateral
ART_X = (CANVAS - ART_W) // 2

PALETTE = {
    'K': '#241f1e',  # corpo / contorno
    'G': '#4a4542',  # brilho na cabeça
    'W': '#fbfaf9',  # barriga / rosto
    'Y': '#f2b91d',  # bico / pés
    'O': '#c9890c',  # sombra do bico / pés
}

# (linha, [(cor, x_inicial, x_final), ...]) — pintadas em ordem, uma sobre a outra
SPANS = [
    (0,  [('K', 7, 17)]),
    (1,  [('K', 6, 18)]),
    (2,  [('K', 5, 19)]),
    (3,  [('K', 4, 20), ('G', 6, 7)]),
    (4,  [('K', 4, 20)]),
    (5,  [('K', 3, 21)]),
    (6,  [('K', 3, 21)]),
    (7,  [('K', 3, 21), ('W', 6, 9), ('W', 15, 18)]),
    (8,  [('K', 2, 22), ('W', 5, 10), ('W', 14, 19)]),
    (9,  [('K', 2, 22), ('W', 5, 11), ('W', 13, 19)]),
    (10, [('K', 2, 22), ('W', 5, 19), ('K', 7, 9), ('K', 15, 17)]),
    (11, [('K', 2, 22), ('W', 5, 19), ('K', 7, 9), ('K', 15, 17)]),
    (12, [('K', 2, 22), ('W', 5, 19), ('K', 7, 9), ('K', 15, 17)]),
    (13, [('K', 2, 22), ('W', 5, 19)]),
    (14, [('K', 2, 22), ('W', 5, 19), ('Y', 10, 14)]),
    (15, [('K', 2, 22), ('W', 5, 19), ('O', 11, 13)]),
    (16, [('K', 2, 22), ('W', 5, 19)]),
    (17, [('K', 3, 21), ('W', 6, 18)]),
    (18, [('K', 3, 21), ('W', 7, 17)]),
    (19, [('K', 2, 22), ('W', 6, 18)]),
    (20, [('K', 1, 23), ('W', 6, 18)]),
    (21, [('K', 1, 23), ('W', 6, 18)]),
    (22, [('K', 0, 24), ('W', 5, 19)]),
    (23, [('K', 0, 24), ('W', 5, 19)]),
    (24, [('K', 0, 24), ('W', 5, 19)]),
    (25, [('K', 1, 23), ('W', 5, 19)]),
    (26, [('K', 3, 21), ('W', 6, 18)]),
    (27, [('K', 4, 20), ('W', 8, 16)]),
    (28, [('K', 5, 19), ('W', 9, 15)]),
    (29, [('Y', 4, 9), ('K', 10, 14), ('Y', 15, 20)]),
    (30, [('Y', 4, 9), ('K', 10, 14), ('Y', 15, 20)]),
    (31, [('O', 4, 4), ('Y', 5, 8), ('O', 9, 9),
          ('O', 15, 15), ('Y', 16, 19), ('O', 20, 20)]),
    (32, [('K', 5, 8), ('K', 16, 19)]),
]

PNG_SIZES = (16, 22, 24, 32, 48, 64, 128, 256)
ICON_NAME = 'opencode-assistant'


def matrix():
    """Grade ART_W x ART_H com a letra da cor (ou None)."""
    m = [[None] * ART_W for _ in range(ART_H)]
    for y, spans in SPANS:
        for ch, a, b in spans:
            for x in range(a, b + 1):
                m[y][x] = ch
    return m


def rects(m):
    """Une pixels iguais em retângulos (horizontal e depois vertical)."""
    runs = []  # (y, x, w, cor)
    for y in range(ART_H):
        x = 0
        while x < ART_W:
            ch = m[y][x]
            if ch is None:
                x += 1
                continue
            w = 1
            while x + w < ART_W and m[y][x + w] == ch:
                w += 1
            runs.append([y, x, w, ch, 1])
            x += w

    by_key = {}
    out = []
    for r in runs:
        y, x, w, ch, _ = r
        key = (x, w, ch)
        prev = by_key.get(key)
        if prev is not None and prev[0] + prev[4] == y:
            prev[4] += 1
        else:
            by_key[key] = r
            out.append(r)
    return out


def svg(m):
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="{c}" height="{c}" '
        'viewBox="0 0 {c} {c}">'.format(c=CANVAS),
        '  <title>OpenCode Assistant</title>',
        '  <g shape-rendering="crispEdges">',
    ]
    for y, x, w, ch, h in rects(m):
        lines.append(
            '    <rect x="{}" y="{}" width="{}" height="{}" fill="{}"/>'.format(
                x + ART_X, y, w, h, PALETTE[ch]))
    lines += ['  </g>', '</svg>', '']
    return '\n'.join(lines)


def write_pngs(m, root):
    try:
        from PIL import Image
    except ImportError:
        print('  (Pillow ausente — PNGs não gerados; use --svg para silenciar)')
        return
    unit = 32
    base = Image.new('RGBA', (CANVAS * unit, CANVAS * unit), (0, 0, 0, 0))
    px = Image.new('RGBA', (ART_W, ART_H), (0, 0, 0, 0))
    p = px.load()
    for y in range(ART_H):
        for x in range(ART_W):
            ch = m[y][x]
            if ch:
                c = PALETTE[ch]
                p[x, y] = (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)
    big = px.resize((ART_W * unit, ART_H * unit), Image.NEAREST)
    base.alpha_composite(big, (ART_X * unit, 0))
    for s in PNG_SIZES:
        d = os.path.join(root, 'icons', 'hicolor', '%dx%d' % (s, s), 'apps')
        os.makedirs(d, exist_ok=True)
        out = os.path.join(d, ICON_NAME + '.png')
        base.resize((s, s), Image.LANCZOS).save(out, optimize=True)
        print('  ' + os.path.relpath(out, root))


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    m = matrix()
    data = svg(m)

    scalable = os.path.join(root, 'icons', 'hicolor', 'scalable', 'apps')
    os.makedirs(scalable, exist_ok=True)
    svg_path = os.path.join(scalable, ICON_NAME + '.svg')
    with open(svg_path, 'w') as f:
        f.write(data)
    print('  ' + os.path.relpath(svg_path, root))

    pkg_icons = os.path.join(root, 'package', 'contents', 'icons')
    os.makedirs(pkg_icons, exist_ok=True)
    shutil.copyfile(svg_path, os.path.join(pkg_icons, ICON_NAME + '.svg'))
    print('  package/contents/icons/%s.svg' % ICON_NAME)

    if '--svg' not in sys.argv:
        write_pngs(m, root)


if __name__ == '__main__':
    main()

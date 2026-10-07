#!/usr/bin/env python3
"""Gera as animações (GIF) de execução dos exercícios em img/ex/<id>.gif.

Desenho vetorial em vista lateral: figura estilizada + máquina, com o músculo
principal destacado e "acendendo" durante a contração.

Uso: python3 tools/gen_anim.py            (requer Pillow)
"""
import math
import os
from PIL import Image, ImageDraw

W, H = 480, 360          # tamanho final
SS = 3                   # supersampling para bordas suaves
FRAMES = 44
FRAME_MS = 40
OUT = os.path.join(os.path.dirname(__file__), '..', 'img', 'ex')

BG = (244, 243, 240)
FLOOR = (226, 223, 217)
SHADOW = (214, 210, 203)
FRAME_C = (150, 155, 163)
FRAME_D = (118, 123, 131)
PAD = (92, 96, 105)
PAD_HI = (120, 124, 133)
PLATE = (36, 37, 41)
PLATE_HI = (72, 74, 80)
SKIN_N = (233, 222, 214)    # membros do lado próximo
SKIN_F = (176, 164, 156)    # membros do lado distante
OUTLINE = (92, 86, 82)
TOP = (32, 33, 38)          # roupa
TOP_F = (28, 29, 33)
HAIR = (52, 38, 32)
MUSCLE_REST = (236, 160, 140)
MUSCLE_PEAK = (255, 74, 38)
ACCENT = (255, 90, 54)


# ---------- utilidades ----------
def v(x, y): return (float(x), float(y))
def add(a, b): return (a[0] + b[0], a[1] + b[1])
def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def mul(a, k): return (a[0] * k, a[1] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1]
def length(a): return math.hypot(*a)
def norm(a):
    l = length(a) or 1
    return (a[0] / l, a[1] / l)
def perp(a): return (-a[1], a[0])
def polar(ang_deg, r=1.0):
    a = math.radians(ang_deg)
    return (math.cos(a) * r, math.sin(a) * r)
def lerp(a, b, t): return a + (b - a) * t
def lerpc(c1, c2, t): return tuple(int(round(lerp(x, y, t))) for x, y in zip(c1, c2))
def ease(t): return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def ik(a, c, l1, l2, bend):
    """Posição da articulação intermediária entre a e c (dois segmentos). bend=+1/-1 escolhe o lado."""
    d = sub(c, a)
    dist = min(length(d), l1 + l2 - 1e-6)
    dist = max(dist, abs(l1 - l2) + 1e-6)
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    y = math.sqrt(max(0.0, l1 * l1 - x * x))
    u = norm(d)
    return add(add(a, mul(u, x)), mul(perp(u), y * bend))


def phase(i):
    """0 = posição inicial, 1 = contração máxima. Subida mais rápida, pausa no pico, descida controlada."""
    f = i / FRAMES
    if f < 0.32: return ease(f / 0.32)
    if f < 0.42: return 1.0
    if f < 0.88: return 1.0 - ease((f - 0.42) / 0.46)
    return 0.0


class Canvas:
    def __init__(self):
        self.im = Image.new('RGB', (W * SS, H * SS), BG)
        self.d = ImageDraw.Draw(self.im)

    def P(self, p): return (p[0] * SS, p[1] * SS)

    def line(self, a, b, w, fill):
        self.d.line([self.P(a), self.P(b)], fill=fill, width=int(w * SS))

    def circle(self, c, r, fill, outline=None, ow=0):
        x, y = self.P(c)
        r *= SS
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=int(ow * SS))

    def poly(self, pts, fill, outline=None, ow=0):
        self.d.polygon([self.P(p) for p in pts], fill=fill, outline=outline, width=int(ow * SS) if outline else 0)

    def ellipse(self, c, rx, ry, fill):
        x, y = self.P(c)
        self.d.ellipse([x - rx * SS, y - ry * SS, x + rx * SS, y + ry * SS], fill=fill)

    def capsule(self, a, b, r, fill, outline=OUTLINE, ow=1.6):
        """Segmento arredondado (membro) com contorno."""
        if outline:
            self.line(a, b, 2 * (r + ow), outline)
            self.circle(a, r + ow, outline)
            self.circle(b, r + ow, outline)
        self.line(a, b, 2 * r, fill)
        self.circle(a, r, fill)
        self.circle(b, r, fill)

    def tapered(self, a, b, ra, rb, fill, outline=OUTLINE, ow=1.6):
        """Membro afunilado (coxa, panturrilha)."""
        n = perp(norm(sub(b, a)))
        def shape(ea, eb, col):
            self.poly([add(a, mul(n, ea)), add(b, mul(n, eb)), sub(b, mul(n, eb)), sub(a, mul(n, ea))], col)
            self.circle(a, ea, col)
            self.circle(b, eb, col)
        if outline:
            shape(ra + ow, rb + ow, outline)
        shape(ra, rb, fill)

    def bar(self, a, b, w, fill=FRAME_C, edge=FRAME_D):
        self.line(a, b, w + 2, edge)
        self.line(a, b, w, fill)
        self.circle(a, (w + 2) / 2, edge); self.circle(b, (w + 2) / 2, edge)
        self.circle(a, w / 2, fill); self.circle(b, w / 2, fill)

    def rect_along(self, center, axis, half_len, half_w, fill, outline=None, ow=0):
        u = norm(axis); n = perp(u)
        pts = [add(add(center, mul(u, s1 * half_len)), mul(n, s2 * half_w)) for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        self.poly(pts, fill, outline, ow)

    def done(self):
        return self.im.resize((W, H), Image.LANCZOS)


def floor(cv, y=318):
    cv.d.rectangle([0, y * SS, W * SS, H * SS], fill=FLOOR)
    cv.ellipse((W / 2, y + 4), 170, 9, SHADOW)


def muscle(cv, a, b, side_n, inset, ra, rb, t, start=0.12, end=0.88):
    """Ventre muscular destacado ao longo de um segmento, deslocado para a face indicada por side_n."""
    pa = lerp(0, 1, start); pb = lerp(0, 1, end)
    p1 = add(add(a, mul(sub(b, a), pa)), mul(side_n, inset))
    p2 = add(add(a, mul(sub(b, a), pb)), mul(side_n, inset))
    col = lerpc(MUSCLE_REST, MUSCLE_PEAK, t)
    cv.tapered(p1, p2, ra * (1 + 0.12 * t), rb * (1 + 0.12 * t), col, outline=None)
    # brilho
    mid = add(mul(add(p1, p2), 0.5), mul(side_n, ra * 0.35))
    hi = lerpc(col, (255, 220, 205), 0.45)
    cv.tapered(add(p1, mul(sub(p2, p1), 0.25)), add(p1, mul(sub(p2, p1), 0.7)), ra * 0.28, rb * 0.22, hi, outline=None) if t > 0.05 else None
    _ = mid


def head(cv, neck, back_dir, face_dir):
    """Cabeça com rabo de cavalo. back_dir aponta para trás da cabeça."""
    c = add(neck, mul(norm(face_dir), 0))
    cv.capsule(sub(c, mul(norm(back_dir), -2)), add(c, mul(norm(back_dir), 10)), 6.5, HAIR, outline=None)
    cv.circle(c, 15.5, OUTLINE)
    cv.circle(c, 14, SKIN_N)
    # cabelo (meia-lua atrás/topo)
    top = add(c, mul(norm(back_dir), 4))
    cv.circle(top, 12.5, HAIR)
    cv.circle(add(c, mul(norm(face_dir), 4)), 11, SKIN_N)
    # rabo de cavalo
    tail0 = add(c, mul(norm(back_dir), 15))
    cv.capsule(tail0, add(tail0, add(mul(norm(back_dir), 9), (0, 9))), 4.5, HAIR, outline=None)


def torso(cv, hip, shoulder, chest_dir, fill=TOP):
    u = norm(sub(shoulder, hip)); n = norm(chest_dir)
    # quadril um pouco mais largo, cintura, ombros
    cv.tapered(hip, shoulder, 17, 15, fill)
    cv.circle(add(shoulder, mul(n, 3)), 10, fill)
    cv.circle(add(hip, mul(n, -3)), 15, (52, 55, 62))


def foot(cv, ankle, toe_dir, sole_dir, fill, length_=28):
    """Pé com tênis: do calcanhar à ponta, sola voltada para sole_dir."""
    u = norm(toe_dir); s = norm(sole_dir)
    heel = add(sub(ankle, mul(u, 7)), mul(s, 4))
    toe = add(add(ankle, mul(u, length_)), mul(s, 4))
    cv.tapered(heel, toe, 7, 5, (238, 238, 240) if fill == SKIN_N else (205, 205, 210))
    cv.line(add(heel, mul(s, 6)), add(toe, mul(s, 4.5)), 2.6, (60, 62, 70))


# ---------- Leg press 45° ----------
RAIL = norm((1, -1))          # direção do trilho (para cima/direita)
PLATE_DIR = perp(RAIL)        # ao longo da plataforma (para baixo/direita)
TH, SH = 80, 76               # coxa, perna


def legpress_machine(cv, plate_c, heel_mode=False):
    # base e trilho
    cv.bar(v(70, 318), v(430, 318), 10)
    cv.bar(v(120, 318), v(140, 286), 8)
    rail_a = v(205, 312); rail_b = add(rail_a, mul(RAIL, 255))
    cv.bar(v(395, 318), add(rail_b, (8, 4)), 9)
    cv.bar(rail_a, rail_b, 12)
    cv.bar(add(rail_a, (16, 6)), add(rail_b, (16, 6)), 6, FRAME_D, (98, 102, 110))
    # trava/topo
    cv.bar(add(rail_b, mul(PLATE_DIR, -30)), add(rail_b, mul(PLATE_DIR, 18)), 9)
    # carrinho
    car = add(plate_c, mul(RAIL, 22))
    car = add(car, mul(PLATE_DIR, 48))
    cv.rect_along(car, RAIL, 34, 11, FRAME_D, (90, 94, 102), 2)
    # pino com anilhas
    pin = add(car, mul(PLATE_DIR, 10))
    pin2 = add(pin, mul(PLATE_DIR, 24))
    cv.bar(pin, pin2, 7)
    for k, r in ((0.55, 36), (0.85, 30)):
        c = add(pin, mul(sub(pin2, pin), k))
        cv.circle(c, r + 1.5, (20, 20, 22))
        cv.circle(c, r, PLATE)
        cv.circle(c, r * 0.72, PLATE_HI)
        cv.circle(c, r * 0.6, PLATE)
        cv.circle(c, 5, FRAME_C)
    # plataforma (pés)
    cv.rect_along(add(plate_c, mul(RAIL, 6)), PLATE_DIR, 46, 6, (62, 64, 70), (40, 41, 46), 2)
    cv.bar(add(plate_c, mul(RAIL, 10)), car, 8, FRAME_C, FRAME_D)
    # banco
    seat = v(196, 268)
    cv.rect_along(add(seat, (-62, -22)), polar(-148), 64, 10, PAD, PAD_HI, 2)   # encosto
    cv.rect_along(add(seat, (-2, 6)), polar(-20), 30, 10, PAD, PAD_HI, 2)      # assento
    cv.bar(add(seat, (-20, 16)), v(170, 318), 9)
    cv.bar(add(seat, (-90, -10)), v(118, 318), 8)
    # pegador lateral
    cv.bar(add(seat, (-6, 26)), add(seat, (14, 26)), 6, FRAME_D, (90, 94, 102))


def legpress_figure(cv, hip, ankle_n, ankle_f, foot_mode, t, focus):
    back = polar(-148)                          # tronco reclinado
    shoulder = add(hip, mul(back, 96))
    neck = add(shoulder, mul(back, 24))
    chest = perp(back)
    if chest[1] > 0: chest = mul(chest, -1)
    # braço distante
    hand = add(hip, (2, 20))
    elbow = ik(shoulder, hand, 50, 46, -1)
    cv.capsule(shoulder, elbow, 7, SKIN_F); cv.capsule(elbow, hand, 6, SKIN_F)
    # perna distante (deslocada para dar profundidade)
    off = (-7, -6)
    hip_f = add(hip, off)
    _leg(cv, hip_f, ankle_f, foot_mode, SKIN_F, (40, 42, 48), t, False, focus)
    torso(cv, hip, shoulder, chest)
    head(cv, neck, polar(-148 + 180 + 20), polar(-60))
    _leg(cv, hip, ankle_n, foot_mode, SKIN_N, TOP, t, True, focus)
    # braço próximo segurando o pegador
    hand = add(hip, (6, 22))
    elbow = ik(shoulder, hand, 50, 46, -1)
    cv.capsule(shoulder, elbow, 7.5, SKIN_N); cv.capsule(elbow, hand, 6.5, SKIN_N)
    cv.circle(hand, 7, SKIN_N, OUTLINE, 1.6)


def _leg(cv, hip, ankle, foot_mode, skin, shorts, t, near, focus):
    if foot_mode == 'flat':
        knee = ik(hip, ankle, TH, SH, -1)
    else:
        knee = foot_mode['knee']
    # coxa com short
    cv.tapered(hip, knee, 15, 10.5, skin)
    cv.tapered(hip, add(hip, mul(sub(knee, hip), 0.42)), 15.8, 13.8, shorts, outline=None)
    th_n = perp(norm(sub(knee, hip)))
    if dot(th_n, sub(ankle, knee)) > 0: th_n = mul(th_n, -1)   # face anterior: oposta à dobra do joelho
    if focus == 'quad' and near:
        muscle(cv, hip, knee, th_n, 4.2, 7.5, 5.5, t, 0.42, 0.88)
    # perna
    cv.tapered(knee, ankle, 10, 6.5, skin)
    sh_n = perp(norm(sub(ankle, knee)))
    if dot(sh_n, sub(hip, knee)) < 0: sh_n = mul(sh_n, -1)     # face posterior: voltada para a coxa
    if focus == 'calf' and near:
        muscle(cv, knee, ankle, sh_n, 3.6, 6.8, 3.5, t, 0.1, 0.62)
    if focus == 'quad' and near:
        pass
    cv.circle(knee, 9.6, skin)
    # pé
    if foot_mode == 'flat':
        foot(cv, ankle, mul(PLATE_DIR, -1), RAIL, skin)
    else:
        foot(cv, ankle, foot_mode['toe_dir'], foot_mode['sole_dir'], skin)


def gen_leg_press():
    hip = v(196, 254)
    off = 14
    def ankle_for(knee_deg):
        target = math.sqrt(TH * TH + SH * SH - 2 * TH * SH * math.cos(math.radians(knee_deg)))
        s = math.sqrt(max(0, target * target - off * off))
        return add(add(hip, mul(RAIL, s)), mul(PLATE_DIR, off))
    a0, a1 = ankle_for(82), ankle_for(160)
    frames = []
    for i in range(FRAMES):
        t = phase(i)
        cv = Canvas(); floor(cv)
        an = (lerp(a0[0], a1[0], t), lerp(a0[1], a1[1], t))
        plate_c = add(an, mul(RAIL, 11))
        legpress_machine(cv, plate_c)
        legpress_figure(cv, hip, an, add(an, (-7, -6)), 'flat', t, 'quad')
        frames.append(cv.done())
    return frames


def gen_calf_press():
    hip = v(196, 254)
    knee_deg = 168
    D = math.sqrt(TH * TH + SH * SH - 2 * TH * SH * math.cos(math.radians(knee_deg)))
    BALL = 21                         # tornozelo -> metatarso
    OFF = -15                         # bola do pé um pouco acima da linha quadril-tornozelo
    def s_for(ankle_deg):             # ângulo tornozelo (perna x pé): 72 = alongado, 128 = na ponta
        hb2 = D * D + BALL * BALL - 2 * D * BALL * math.cos(math.radians(ankle_deg))
        return math.sqrt(max(0.0, hb2 - OFF * OFF))
    s0, s1 = s_for(72), s_for(128)
    frames = []
    for i in range(FRAMES):
        t = phase(i)
        cv = Canvas(); floor(cv)
        ball = add(add(hip, mul(RAIL, lerp(s0, s1, t))), mul(PLATE_DIR, OFF))
        contact = add(ball, mul(RAIL, 10))                 # borda da plataforma
        # tornozelo: distância D do quadril e BALL da bola do pé
        ankle = ik(hip, ball, D, BALL, 1)
        plate_c = sub(contact, mul(PLATE_DIR, 40))
        legpress_machine(cv, plate_c)
        def mode(an, b):
            knee = ik(hip_of(an), an, TH, SH, -1)
            u = norm(sub(b, an))
            s = perp(u)
            if s[0] < 0: s = mul(s, -1)
            return {'knee': knee, 'toe_dir': u, 'sole_dir': s}
        hip_of = lambda an: hip if an is ankle else add(hip, (-5, -4))
        far_an, far_b = add(ankle, (-7, -6)), add(ball, (-7, -6))
        def draw():
            legpress_figure_custom(cv, hip, (ankle, ball), (far_an, far_b), t)
        draw()
        frames.append(cv.done())
    return frames


def legpress_figure_custom(cv, hip, near, far, t):
    back = polar(-148)
    shoulder = add(hip, mul(back, 96))
    neck = add(shoulder, mul(back, 24))
    chest = perp(back)
    if chest[1] > 0: chest = mul(chest, -1)
    def mode(h, an, b):
        knee = ik(h, an, TH, SH, -1)
        u = norm(sub(b, an)); s = perp(u)
        if s[0] < 0: s = mul(s, -1)
        return {'knee': knee, 'toe_dir': u, 'sole_dir': s}
    hand = add(hip, (2, 20))
    elbow = ik(shoulder, hand, 50, 46, -1)
    cv.capsule(shoulder, elbow, 7, SKIN_F); cv.capsule(elbow, hand, 6, SKIN_F)
    hf = add(hip, (-7, -6))
    _leg(cv, hf, far[0], mode(hf, *far), SKIN_F, (40, 42, 48), t, False, 'calf')
    torso(cv, hip, shoulder, chest)
    head(cv, neck, polar(-148 + 180 + 20), polar(-60))
    _leg(cv, hip, near[0], mode(hip, *near), SKIN_N, TOP, t, True, 'calf')
    hand = add(hip, (6, 22))
    elbow = ik(shoulder, hand, 50, 46, -1)
    cv.capsule(shoulder, elbow, 7.5, SKIN_N); cv.capsule(elbow, hand, 6.5, SKIN_N)
    cv.circle(hand, 7, SKIN_N, OUTLINE, 1.6)


# ---------- Cadeira extensora ----------
def gen_leg_extension():
    hip = v(196, 218)
    knee = v(276, 222)
    frames = []
    for i in range(FRAMES):
        t = phase(i)
        cv = Canvas(); floor(cv)
        ang = lerp(98, 8, t)                       # 98° = perna para baixo, 8° = quase estendida
        ankle = add(knee, polar(ang, SH))
        # torre de pesos (atrás)
        cv.bar(v(86, 318), v(86, 92), 10); cv.bar(v(132, 318), v(132, 92), 10)
        cv.bar(v(80, 92), v(138, 92), 10)
        lift = 34 * t
        for k in range(8):
            y = 300 - k * 11
            if k >= 5: y -= lift
            cv.d.rectangle([94 * SS, (y - 9) * SS, 124 * SS, y * SS], fill=PLATE if k < 7 else PLATE_HI, outline=(20, 20, 22), width=SS)
        cv.line(v(109, 92), v(109, 300 - 7 * 11 - 9 - lift), 2.5, (60, 62, 68))
        # estrutura e banco
        cv.bar(v(60, 318), v(380, 318), 10)
        cv.bar(v(220, 318), v(220, 242), 12)
        cv.rect_along(v(222, 236), (1, 0.03), 66, 11, PAD, PAD_HI, 2)            # assento
        cv.rect_along(v(160, 168), polar(-100), 62, 11, PAD, PAD_HI, 2)          # encosto
        cv.bar(v(172, 236), v(140, 225), 8)
        cv.bar(v(150, 110), v(150, 236), 9)
        # pegador
        cv.bar(v(188, 250), v(210, 250), 7, FRAME_D, (90, 94, 102))
        # rolo da coxa
        cv.rect_along(add(knee, (-14, -22)), (1, 0), 15, 7, PAD, PAD_HI, 2)
        # braço de alavanca (gira no joelho)
        cv.bar(knee, add(knee, polar(ang, SH - 6)), 9, FRAME_D, (90, 94, 102))
        cv.circle(knee, 9, FRAME_C, FRAME_D, 2)
        cv.circle(knee, 3, FRAME_D)
        # figura
        shoulder = add(hip, polar(-100, 96))
        neck = add(shoulder, polar(-100, 24))
        hand = v(196, 246)
        elbow = ik(shoulder, hand, 50, 46, -1)
        cv.capsule(shoulder, elbow, 7, SKIN_F); cv.capsule(elbow, hand, 6, SKIN_F)
        kf = add(knee, (-5, -3)); hf = add(hip, (-5, -3))
        af = add(kf, polar(ang, SH))
        cv.tapered(hf, kf, 15, 10.5, SKIN_F); cv.tapered(kf, af, 10, 6.5, SKIN_F)
        foot(cv, af, polar(ang - 90, 1), polar(ang, 1), SKIN_F)
        torso(cv, hip, shoulder, (1, 0))
        head(cv, neck, (-1, 0.15), (1, -0.1))
        # perna próxima
        cv.tapered(hip, knee, 15, 10.5, SKIN_N)
        cv.tapered(hip, add(hip, mul(sub(knee, hip), 0.42)), 15.8, 13.8, TOP, outline=None)
        muscle(cv, hip, knee, (0, -1), 4.0, 7.8, 5.8, t, 0.4, 0.9)
        cv.tapered(knee, ankle, 10, 6.5, SKIN_N)
        cv.circle(knee, 9.6, SKIN_N)
        foot(cv, ankle, polar(ang - 90, 1), polar(ang, 1), SKIN_N)
        # rolo do tornozelo (na frente da canela)
        roll = add(add(knee, polar(ang, SH - 6)), polar(ang - 90, 15))
        cv.circle(roll, 11.5, (20, 20, 22)); cv.circle(roll, 10, PAD); cv.circle(roll, 4, PAD_HI)
        # braço próximo
        hand = v(200, 250)
        elbow = ik(shoulder, hand, 50, 46, -1)
        cv.capsule(shoulder, elbow, 7.5, SKIN_N); cv.capsule(elbow, hand, 6.5, SKIN_N)
        cv.circle(hand, 7, SKIN_N, OUTLINE, 1.6)
        frames.append(cv.done())
    return frames


def save(name, frames):
    os.makedirs(OUT, exist_ok=True)
    pal = frames[FRAMES // 3].quantize(colors=128, method=Image.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    path = os.path.join(OUT, name + '.gif')
    q[0].save(path, save_all=True, append_images=q[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    print(path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    save('leg-press-45', gen_leg_press())
    save('panturrilha-leg', gen_calf_press())
    save('cadeira-extensora', gen_leg_extension())

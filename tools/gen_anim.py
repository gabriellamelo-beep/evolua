#!/usr/bin/env python3
"""Gera as animações (GIF) de execução dos exercícios em img/ex/<id>.gif.

Desenho vetorial em vista lateral: figura estilizada + equipamento, com o músculo
principal destacado e "acendendo" durante o esforço. A figura sempre olha para a
direita; cada exercício só descreve a posição das articulações em função de p
(0 = posição inicial, 1 = fim do movimento) e o que desenhar em volta.

Uso: python3 tools/gen_anim.py [id ...]      (requer Pillow; sem ids gera todos)
"""
import math
import os
import sys
from PIL import Image, ImageDraw

W, H = 480, 360          # tamanho final
SS = 3                   # supersampling para bordas suaves
FRAMES = 40
FRAME_MS = 45
FLOOR_Y = 318
OUT = os.path.join(os.path.dirname(__file__), '..', 'img', 'ex')

BG = (244, 243, 240)
FLOOR = (226, 223, 217)
SHADOW = (214, 210, 203)
FRAME_C = (150, 155, 163)
FRAME_D = (118, 123, 131)
FRAME_E = (90, 94, 102)
PAD = (92, 96, 105)
PAD_HI = (120, 124, 133)
PLATE = (36, 37, 41)
PLATE_HI = (72, 74, 80)
METAL = (176, 180, 188)
SKIN_N = (233, 222, 214)    # lado próximo
SKIN_F = (176, 164, 156)    # lado distante
OUTLINE = (92, 86, 82)
TOP = (32, 33, 38)          # roupa
SHORTS_F = (44, 46, 52)
HIP_C = (52, 55, 62)
HAIR = (52, 38, 32)
MUSCLE_REST = (236, 160, 140)
MUSCLE_PEAK = (255, 74, 38)
MAT = (196, 120, 104)

# comprimentos dos segmentos (px)
TH, SH, TO, NK, UA, FA = 80, 76, 96, 24, 50, 46
ANK_Y = FLOOR_Y - 11      # altura do tornozelo com o pé apoiado no chão


# ---------- vetores ----------
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
def rot(a, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (a[0] * c - a[1] * s, a[0] * s + a[1] * c)
def lerp(a, b, t): return a + (b - a) * t
def lerpv(a, b, t): return (lerp(a[0], b[0], t), lerp(a[1], b[1], t))
def lerpc(c1, c2, t): return tuple(int(round(lerp(x, y, t))) for x, y in zip(c1, c2))
def ease(t): return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))
def clamp01(t): return max(0.0, min(1.0, t))
def lean(base, ang, r):
    """Ponto a r de base, inclinado ang graus da vertical (positivo = para a frente/direita)."""
    return add(base, (math.sin(math.radians(ang)) * r, -math.cos(math.radians(ang)) * r))
def hang(base, ang, r):
    """Como lean, mas para baixo (ang positivo = para a frente)."""
    return add(base, (math.sin(math.radians(ang)) * r, math.cos(math.radians(ang)) * r))


def ik(a, c, l1, l2, bend):
    """Articulação intermediária entre a e c (dois segmentos). bend=+1/-1 escolhe o lado."""
    d = sub(c, a)
    dist = min(length(d), l1 + l2 - 1e-6)
    dist = max(dist, abs(l1 - l2) + 1e-6)
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    y = math.sqrt(max(0.0, l1 * l1 - x * x))
    u = norm(d)
    return add(add(a, mul(u, x)), mul(perp(u), y * bend))


def reach(a, c, maxlen):
    """Limita c ao alcance maxlen a partir de a."""
    d = sub(c, a)
    return c if length(d) <= maxlen else add(a, mul(norm(d), maxlen))


def solve(f, lo, hi, target, steps=40):
    """Bisseção: x em [lo, hi] com f(x) ~ target (f monotônica)."""
    flo = f(lo) - target
    for _ in range(steps):
        mid = (lo + hi) / 2
        fm = f(mid) - target
        if (fm < 0) == (flo < 0): lo, flo = mid, fm
        else: hi = mid
    return (lo + hi) / 2


# ---------- ritmo ----------
def phase_up(i):
    """Esforço primeiro: subida rápida, pausa no pico, volta controlada."""
    f = i / FRAMES
    if f < 0.30: return ease(f / 0.30)
    if f < 0.40: return 1.0
    if f < 0.86: return 1.0 - ease((f - 0.40) / 0.46)
    return 0.0


def phase_down(i):
    """Descida controlada primeiro (agachamentos, stiff): desce devagar, pausa, sobe rápido."""
    f = i / FRAMES
    if f < 0.44: return ease(f / 0.44)
    if f < 0.52: return 1.0
    if f < 0.80: return 1.0 - ease((f - 0.52) / 0.28)
    return 0.0


# ---------- tela ----------
class Canvas:
    def __init__(self, k=1.0, anchor=(240, FLOOR_Y)):
        self.im = Image.new('RGB', (W * SS, H * SS), BG)
        self.d = ImageDraw.Draw(self.im)
        self.k, self.ax, self.ay = k, anchor[0], anchor[1]

    def P(self, p):
        return ((self.ax + (p[0] - self.ax) * self.k) * SS, (self.ay + (p[1] - self.ay) * self.k) * SS)

    def s(self, r): return r * SS * self.k

    def line(self, a, b, w, fill):
        self.d.line([self.P(a), self.P(b)], fill=fill, width=max(1, int(self.s(w))))

    def circle(self, c, r, fill, outline=None, ow=0):
        x, y = self.P(c); r = self.s(r)
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=int(self.s(ow)))

    def poly(self, pts, fill, outline=None, ow=0):
        self.d.polygon([self.P(p) for p in pts], fill=fill, outline=outline, width=int(self.s(ow)) if outline else 0)

    def ellipse(self, c, rx, ry, fill):
        x, y = self.P(c)
        self.d.ellipse([x - self.s(rx), y - self.s(ry), x + self.s(rx), y + self.s(ry)], fill=fill)

    def capsule(self, a, b, r, fill, outline=OUTLINE, ow=1.6):
        if outline:
            self.line(a, b, 2 * (r + ow), outline)
            self.circle(a, r + ow, outline); self.circle(b, r + ow, outline)
        self.line(a, b, 2 * r, fill)
        self.circle(a, r, fill); self.circle(b, r, fill)

    def tapered(self, a, b, ra, rb, fill, outline=OUTLINE, ow=1.6):
        n = perp(norm(sub(b, a)))
        def shape(ea, eb, col):
            self.poly([add(a, mul(n, ea)), add(b, mul(n, eb)), sub(b, mul(n, eb)), sub(a, mul(n, ea))], col)
            self.circle(a, ea, col); self.circle(b, eb, col)
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

    def box(self, x0, y0, x1, y1, fill, outline=None, ow=0):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, outline, ow)

    def done(self):
        return self.im.resize((W, H), Image.LANCZOS)


def floor(cv, cx=240, rx=170):
    cv.d.rectangle([0, FLOOR_Y * SS, W * SS, H * SS], fill=FLOOR)
    cv.d.ellipse([(cx - rx) * SS, (FLOOR_Y - 5) * SS, (cx + rx) * SS, (FLOOR_Y + 13) * SS], fill=SHADOW)


# ---------- equipamentos ----------
def plate_disc(cv, c, r):
    cv.circle(c, r + 1.5, (20, 20, 22))
    cv.circle(c, r, PLATE)
    cv.circle(c, r * 0.74, PLATE_HI)
    cv.circle(c, r * 0.62, PLATE)
    cv.circle(c, max(4, r * 0.16), METAL)


def bar_end(cv, c):
    cv.circle(c, 6.5, FRAME_E); cv.circle(c, 5, METAL)


def dumbbell_side(cv, c, far=False):
    """Halter visto de lado (de ponta): disco com a manopla atrás."""
    cv.circle(c, 12.5, (20, 20, 22))
    cv.circle(c, 11, (58, 60, 66) if far else PLATE)
    cv.circle(c, 6.5, PLATE_HI if not far else (78, 80, 86))
    cv.circle(c, 3, METAL)


def dumbbell_upright(cv, c, axis):
    """Halter na vertical (goblet): duas cabeças ao longo de axis."""
    u = norm(axis)
    cv.bar(sub(c, mul(u, 14)), add(c, mul(u, 14)), 5, METAL, FRAME_E)
    for s_ in (-1, 1):
        cv.rect_along(add(c, mul(u, 18 * s_)), perp(u), 13, 6, PLATE, (20, 20, 22), 1.5)


def bench(cv, x0, x1, top, legs=True, incline=None):
    if legs:
        cv.bar(v(x0 + 12, top + 8), v(x0 + 12, FLOOR_Y), 8)
        cv.bar(v(x1 - 12, top + 8), v(x1 - 12, FLOOR_Y), 8)
        cv.bar(v(x0 + 4, FLOOR_Y - 2), v(x1 - 4, FLOOR_Y - 2), 7)
    cv.box(x0, top, x1, top + 13, PAD, PAD_HI, 2)


def stack(cv, x, y_bottom, n, lift, top_moving=3, w=30):
    """Pilha de placas; as top_moving de cima sobem 'lift' px."""
    for k in range(n):
        y = y_bottom - k * 11
        if k >= n - top_moving: y -= lift
        cv.box(x - w / 2, y - 9, x + w / 2, y, PLATE if k < n - 1 else PLATE_HI, (20, 20, 22), 1)
    return y_bottom - (n - 1) * 11 - 9 - lift


def column(cv, x, top=40, w=46):
    cv.bar(v(x - w / 2, FLOOR_Y), v(x - w / 2, top), 9)
    cv.bar(v(x + w / 2, FLOOR_Y), v(x + w / 2, top), 9)
    cv.bar(v(x - w / 2 - 6, top), v(x + w / 2 + 6, top), 10)
    cv.bar(v(x - w / 2 - 12, FLOOR_Y - 2), v(x + w / 2 + 12, FLOOR_Y - 2), 8)


# ---------- figura ----------
def muscle(cv, a, b, side_n, inset, ra, rb, t, start, end):
    p1 = add(add(a, mul(sub(b, a), start)), mul(side_n, inset))
    p2 = add(add(a, mul(sub(b, a), end)), mul(side_n, inset))
    col = lerpc(MUSCLE_REST, MUSCLE_PEAK, t)
    cv.tapered(p1, p2, ra * (1 + 0.12 * t), rb * (1 + 0.12 * t), col, outline=None)
    if t > 0.05:
        hi = lerpc(col, (255, 220, 205), 0.45)
        cv.tapered(add(p1, mul(sub(p2, p1), 0.25)), add(p1, mul(sub(p2, p1), 0.7)), ra * 0.28, rb * 0.22, hi, outline=None)


def ant_of(a, b):
    """Normal anterior de um segmento proximal->distal (coxa, perna, braço)."""
    return mul(perp(norm(sub(b, a))), -1)


def draw_head(cv, shoulder, nd, tilt=0):
    nd = rot(nd, tilt)
    face = perp(nd)
    c = add(shoulder, mul(nd, NK))
    back = mul(face, -1)
    tail0 = add(add(c, mul(back, 12)), mul(nd, 3))
    tail1 = add(add(tail0, mul(back, 7)), (0, 11))
    cv.capsule(tail0, tail1, 4.8, HAIR, outline=None)
    cv.circle(c, 15.5, OUTLINE)
    cv.circle(c, 14, SKIN_N)
    cv.circle(add(add(c, mul(back, 3.5)), mul(nd, 2.5)), 12.5, HAIR)
    cv.circle(add(c, mul(face, 4.5)), 10.5, SKIN_N)
    cv.circle(add(c, mul(nd, -1)), 3, HAIR) if False else None


def draw_torso(cv, hip, shoulder, focus, t):
    nd = norm(sub(shoulder, hip)); ant = perp(nd)
    cv.tapered(hip, shoulder, 17, 15, TOP)
    cv.circle(add(shoulder, mul(ant, 3)), 10, TOP)
    cv.circle(add(hip, mul(ant, -3)), 15, HIP_C)
    post = mul(ant, -1)
    if 'lower' in focus:
        muscle(cv, hip, shoulder, post, 9, 5.5, 4.5, t * focus['lower'], 0.15, 0.55)
    if 'back' in focus:
        muscle(cv, hip, shoulder, post, 8, 6, 8, t * focus['back'], 0.35, 0.82)
    if 'traps' in focus:
        muscle(cv, hip, shoulder, post, 6, 5, 6, t * focus['traps'], 0.84, 1.1)
    if 'chest' in focus:
        muscle(cv, hip, shoulder, ant, 8, 6.5, 8, t * focus['chest'], 0.6, 0.92)
    if 'abs' in focus:
        muscle(cv, hip, shoulder, ant, 9, 5, 5.5, t * focus['abs'], 0.12, 0.56)


def draw_leg(cv, L, near, focus, t):
    hip, knee, ankle = L['hip'], L['knee'], L['ankle']
    skin = SKIN_N if near else SKIN_F
    shorts = TOP if near else SHORTS_F
    th_ant = ant_of(hip, knee)
    sh_ant = ant_of(knee, ankle)
    cv.tapered(hip, knee, 15, 10.5, skin)
    cv.tapered(hip, add(hip, mul(sub(knee, hip), 0.42)), 15.8, 13.8, shorts, outline=None)
    if near:
        if 'glute' in focus:
            tor_post = mul(L['torso_ant'], -1)
            g1 = add(hip, mul(tor_post, 6))
            g2 = add(g1, mul(norm(sub(knee, hip)), 13))
            muscle(cv, g1, g2, tor_post, 1, 9.5, 8.5, t * focus['glute'], 0.0, 1.0)
        if 'quad' in focus:
            muscle(cv, hip, knee, th_ant, 4.2, 7.5, 5.5, t * focus['quad'], 0.42, 0.88)
        if 'ham' in focus:
            muscle(cv, hip, knee, mul(th_ant, -1), 4.2, 7.0, 5.0, t * focus['ham'], 0.42, 0.86)
    cv.tapered(knee, ankle, 10, 6.5, skin)
    if near and 'calf' in focus:
        muscle(cv, knee, ankle, mul(sh_ant, -1), 3.6, 6.8, 3.5, t * focus['calf'], 0.1, 0.62)
    cv.circle(knee, 9.6, skin)
    toe = norm(L.get('toe') or rot(sh_ant, L.get('foot_rot', 0)))
    sole = perp(toe)
    heel = add(sub(ankle, mul(toe, 7)), mul(sole, 4))
    tip = add(add(ankle, mul(toe, 28)), mul(sole, 4))
    cv.tapered(heel, tip, 7, 5, (238, 238, 240) if near else (205, 205, 210))
    cv.line(add(heel, mul(sole, 6)), add(tip, mul(sole, 4.5)), 2.6, (60, 62, 70))


def draw_arm(cv, A, near, focus=None, t=0.0):
    skin = SKIN_N if near else SKIN_F
    sh, el, hand = A['sh'], A['elbow'], A['hand']
    cv.capsule(sh, el, 7.5 if near else 7, skin)
    cv.capsule(el, hand, 6.5 if near else 6, skin)
    if near and focus:
        a_ant = ant_of(sh, el)
        if 'delt' in focus:
            muscle(cv, sh, el, a_ant, 0.5, 8.5, 6.5, t * focus['delt'], -0.06, 0.3)
        if 'biceps' in focus:
            muscle(cv, sh, el, a_ant, 2.6, 5, 3.8, t * focus['biceps'], 0.3, 0.86)
        if 'triceps' in focus:
            muscle(cv, sh, el, mul(a_ant, -1), 2.6, 5, 3.8, t * focus['triceps'], 0.24, 0.84)
    cv.circle(hand, 7 if near else 6.5, skin, OUTLINE, 1.6)


def leg(hip, ankle, toe=None, knee=None, foot_rot=0):
    return {'hip': hip, 'ankle': ankle, 'knee': knee or ik(hip, ankle, TH, SH, -1), 'toe': toe, 'foot_rot': foot_rot}


def arm(sh, hand, bend=1, elbow=None):
    hand = reach(sh, hand, UA + FA - 0.5)
    return {'sh': sh, 'hand': hand, 'elbow': elbow or ik(sh, hand, UA, FA, bend)}


def shifted(d, off):
    out = {}
    for k_, val in d.items():
        out[k_] = add(val, off) if isinstance(val, tuple) and k_ not in ('toe',) else val
    return out


def figure(cv, J, hooks=None, focus=None, t=0.0):
    """Desenha a cena: hooks['back'] -> lado distante -> hooks['mid'] -> tronco/cabeça -> perna próxima
    -> hooks['front_leg'] -> braço próximo -> hooks['front']."""
    hooks = hooks or {}
    focus = focus or {}
    hip, sh = J['hip'], J['shoulder']
    nd = norm(sub(sh, hip)); tor_ant = perp(nd)
    off = J.get('off', (-6, -5))
    Ln, An = J['Ln'], J['An']
    Lf = J.get('Lf') or shifted(Ln, off)
    Af = J.get('Af') or shifted(An, off)
    for L in (Ln, Lf): L['torso_ant'] = tor_ant
    if 'back' in hooks: hooks['back'](cv)
    draw_arm(cv, Af, False)
    if 'far_hand' in hooks: hooks['far_hand'](cv)
    draw_leg(cv, Lf, False, focus, t)
    if 'mid' in hooks: hooks['mid'](cv)
    draw_torso(cv, hip, sh, focus, t)
    draw_head(cv, sh, nd, J.get('head_tilt', 0))
    draw_leg(cv, Ln, True, focus, t)
    if 'front_leg' in hooks: hooks['front_leg'](cv)
    draw_arm(cv, An, True, focus, t)
    if 'front' in hooks: hooks['front'](cv)


def stand_chain(ankle, a_s, a_t, a_b):
    """Corpo em pé a partir do tornozelo: inclinação da perna (frente+), da coxa (trás+) e do tronco (frente+)."""
    knee = lean(ankle, a_s, SH)
    hip = lean(knee, -a_t, TH)
    sh = lean(hip, a_b, TO)
    return knee, hip, sh


# ================= exercícios =================
EX = {}
def exercise(id_, phase=phase_up, k=1.0, anchor=(240, FLOOR_Y), shadow=(240, 170)):
    def deco(fn):
        EX[id_] = dict(fn=fn, phase=phase, k=k, anchor=anchor, shadow=shadow)
        return fn
    return deco


# ---------- máquinas de leg press ----------
RAIL = norm((1, -1))
PLATE_DIR = perp(RAIL)


def legpress_machine(cv, plate_c):
    cv.bar(v(70, FLOOR_Y), v(430, FLOOR_Y), 10)
    cv.bar(v(120, FLOOR_Y), v(140, 286), 8)
    rail_a = v(205, 312); rail_b = add(rail_a, mul(RAIL, 255))
    cv.bar(v(395, FLOOR_Y), add(rail_b, (8, 4)), 9)
    cv.bar(rail_a, rail_b, 12)
    cv.bar(add(rail_a, (16, 6)), add(rail_b, (16, 6)), 6, FRAME_D, (98, 102, 110))
    cv.bar(add(rail_b, mul(PLATE_DIR, -30)), add(rail_b, mul(PLATE_DIR, 18)), 9)
    car = add(add(plate_c, mul(RAIL, 22)), mul(PLATE_DIR, 48))
    cv.rect_along(car, RAIL, 34, 11, FRAME_D, FRAME_E, 2)
    pin = add(car, mul(PLATE_DIR, 10)); pin2 = add(pin, mul(PLATE_DIR, 24))
    cv.bar(pin, pin2, 7)
    for kk, r in ((0.55, 36), (0.85, 30)):
        plate_disc(cv, add(pin, mul(sub(pin2, pin), kk)), r)
    cv.rect_along(add(plate_c, mul(RAIL, 6)), PLATE_DIR, 46, 6, (62, 64, 70), (40, 41, 46), 2)
    cv.bar(add(plate_c, mul(RAIL, 10)), car, 8)
    seat = v(196, 268)
    cv.rect_along(add(seat, (-62, -22)), polar(-148), 64, 10, PAD, PAD_HI, 2)
    cv.rect_along(add(seat, (-2, 6)), polar(-20), 30, 10, PAD, PAD_HI, 2)
    cv.bar(add(seat, (-20, 16)), v(170, FLOOR_Y), 9)
    cv.bar(add(seat, (-90, -10)), v(118, FLOOR_Y), 8)
    cv.bar(add(seat, (-6, 26)), add(seat, (14, 26)), 6, FRAME_D, FRAME_E)


def legpress_body(hip, Ln, Lf):
    sh = add(hip, mul(polar(-148), TO))
    return {'hip': hip, 'shoulder': sh, 'Ln': Ln, 'Lf': Lf, 'off': (-7, -6),
            'An': arm(sh, add(hip, (6, 22)), -1), 'head_tilt': -20}


@exercise('leg-press-45')
def ex_leg_press(p):
    hip = v(196, 254)
    def ankle_for(knee_deg):
        d = math.sqrt(TH * TH + SH * SH - 2 * TH * SH * math.cos(math.radians(knee_deg)))
        s = math.sqrt(max(0, d * d - 14 * 14))
        return add(add(hip, mul(RAIL, s)), mul(PLATE_DIR, 14))
    an = lerpv(ankle_for(82), ankle_for(160), p)
    toe = mul(PLATE_DIR, -1)
    J = legpress_body(hip, leg(hip, an, toe), leg(add(hip, (-7, -6)), add(an, (-7, -6)), toe))
    return J, {'back': lambda cv: legpress_machine(cv, add(an, mul(RAIL, 11)))}, {'quad': 1, 'glute': 0.4}


@exercise('panturrilha-leg')
def ex_calf_press(p):
    hip = v(196, 254)
    D = math.sqrt(TH * TH + SH * SH - 2 * TH * SH * math.cos(math.radians(168)))
    BALL, OFF = 21, -15
    def s_for(deg):
        hb2 = D * D + BALL * BALL - 2 * D * BALL * math.cos(math.radians(deg))
        return math.sqrt(max(0.0, hb2 - OFF * OFF))
    ball = add(add(hip, mul(RAIL, lerp(s_for(72), s_for(128), p))), mul(PLATE_DIR, OFF))
    contact = add(ball, mul(RAIL, 10))
    def mk(h, b):
        an = ik(h, b, D, BALL, 1)
        return leg(h, an, norm(sub(b, an)))
    hf = add(hip, (-7, -6))
    J = legpress_body(hip, mk(hip, ball), mk(hf, add(ball, (-7, -6))))
    return J, {'back': lambda cv: legpress_machine(cv, sub(contact, mul(PLATE_DIR, 40)))}, {'calf': 1}


@exercise('leg-press-horizontal')
def ex_leg_press_h(p):
    hip = v(176, 236)
    sh = lean(hip, -14, TO)
    def ankle_for(knee_deg):
        d = math.sqrt(TH * TH + SH * SH - 2 * TH * SH * math.cos(math.radians(knee_deg)))
        return add(hip, (math.sqrt(max(0, d * d - 20 * 20)), -20))
    an = lerpv(ankle_for(84), ankle_for(162), p)
    plate_x = an[0] + 12
    def machine(cv):
        cv.bar(v(60, FLOOR_Y), v(440, FLOOR_Y), 10)
        cv.bar(v(240, 262), v(400, 262), 9)                       # trilho
        cv.bar(v(250, 262), v(250, FLOOR_Y), 9)
        column(cv, 412, 70, 40)
        top = stack(cv, 412, 300, 9, 46 * p, 3)
        cv.line(v(412, 70), v(412, top), 2.5, (60, 62, 68))
        cv.line(v(398, 72), v(plate_x + 8, 210), 2.5, (60, 62, 68))  # cabo
        cv.box(plate_x - 2, 170, plate_x + 10, 262, (62, 64, 70), (40, 41, 46), 2)
        cv.box(plate_x + 6, 248, plate_x + 44, 270, FRAME_D, FRAME_E, 2)
        cv.rect_along(lean(hip, -14, 54), polar(-104), 58, 11, PAD, PAD_HI, 2)   # encosto
        cv.box(130, 246, 214, 260, PAD, PAD_HI, 2)                                # assento
        cv.bar(v(172, 260), v(172, FLOOR_Y), 10)
        cv.bar(v(116, 186), v(150, 262), 8)
        cv.bar(v(196, 268), v(222, 268), 6, FRAME_D, FRAME_E)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, an, (0, -1)), 'An': arm(sh, v(204, 266), -1)}
    return J, {'back': machine}, {'quad': 1, 'glute': 0.4}


@exercise('hack-squat', phase=phase_down, k=0.9)
def ex_hack(p):
    RD = norm((-0.5, -0.866))
    A = v(304, 293)                      # pés à frente do quadril, na parte alta da plataforma
    hip = add(add(A, (-66, -140)), mul(RD, -72 * p))
    sh = add(hip, mul(RD, TO))
    ant = perp(RD)
    def machine(cv):
        cv.bar(v(80, FLOOR_Y), v(420, FLOOR_Y), 10)
        base = add(A, (-66, -140))
        r0 = add(add(base, mul(RD, -170)), mul(ant, -30))
        r1 = add(add(base, mul(RD, 140)), mul(ant, -30))
        cv.bar(r0, r1, 12)
        cv.bar(r1, v(r1[0] + 40, FLOOR_Y), 9)
        cv.bar(add(r0, (0, 0)), v(r0[0] + 20, FLOOR_Y), 9)
        pad_c = add(add(hip, mul(RD, 50)), mul(ant, -17))
        cv.rect_along(pad_c, RD, 64, 8, PAD, PAD_HI, 2)
        horn = add(add(hip, mul(RD, 10)), mul(ant, -40))
        cv.bar(add(pad_c, mul(ant, -8)), horn, 7)
        plate_disc(cv, horn, 30)
        cv.poly([(246, 306), (356, 288), (356, 306)], FRAME_D, FRAME_E, 2)       # plataforma inclinada
    def pads(cv):
        c = add(add(sh, mul(RD, 6)), mul(ant, 4))
        cv.rect_along(c, ant, 13, 7, PAD, PAD_HI, 2)
        cv.bar(add(c, mul(ant, 10)), add(add(c, mul(ant, 16)), mul(RD, -10)), 5, FRAME_D, FRAME_E)
    hand = add(add(sh, mul(ant, 22)), mul(RD, -6))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, A, rot((1, 0), -10)), 'An': arm(sh, hand, 1)}
    return J, {'back': machine, 'front': pads}, {'quad': 1, 'glute': 0.4}


# ---------- agachamentos ----------
def barbell_on_back(sh, hip):
    nd = norm(sub(sh, hip)); ant = perp(nd)
    return add(add(sh, mul(ant, -9)), mul(nd, -3))


def back_bar_arm(sh, hip, bar):
    nd = norm(sub(sh, hip))
    elbow = add(sh, mul(rot(mul(nd, -1), 38), UA - 6))
    return {'sh': sh, 'elbow': elbow, 'hand': add(bar, mul(perp(nd), 7))}


def squat_hooks(bar, plate_r=34, smith_x=None):
    def back(cv):
        if smith_x is not None:
            cv.bar(v(smith_x, FLOOR_Y), v(smith_x, 22), 10)
            cv.bar(v(smith_x - 30, FLOOR_Y - 2), v(smith_x + 30, FLOOR_Y - 2), 8)
            cv.bar(v(smith_x - 12, 22), v(smith_x + 12, 22), 9)
        plate_disc(cv, bar, plate_r)
    return {'back': back, 'front': lambda cv: bar_end(cv, bar)}


@exercise('agachamento-livre', phase=phase_down, k=0.9)
def ex_squat(p):
    ankle = v(226, ANK_Y)
    knee, hip, sh = stand_chain(ankle, lerp(4, 34, p), lerp(4, 96, p), lerp(4, 44, p))
    bar = barbell_on_back(sh, hip)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': back_bar_arm(sh, hip, bar)}
    return J, squat_hooks(bar), {'quad': 1, 'glute': 0.5}


@exercise('agachamento-smith', phase=phase_down, k=0.9)
def ex_smith(p):
    ankle = v(246, ANK_Y)
    a_s, a_t = lerp(2, 26, p), lerp(4, 94, p)
    x0 = barbell_on_back(*reversed(stand_chain(ankle, 2, 4, 3)[1:]))[0]
    def bar_x(a_b):
        _, hip, sh = stand_chain(ankle, a_s, a_t, a_b)
        return barbell_on_back(sh, hip)[0]
    a_b = solve(bar_x, 0, 60, x0)
    knee, hip, sh = stand_chain(ankle, a_s, a_t, a_b)
    bar = barbell_on_back(sh, hip)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': back_bar_arm(sh, hip, bar)}
    return J, squat_hooks(bar, 30, smith_x=x0), {'quad': 1, 'glute': 0.5}


@exercise('agachamento-goblet', phase=phase_down, k=0.92)
def ex_goblet(p):
    ankle = v(232, ANK_Y)
    knee, hip, sh = stand_chain(ankle, lerp(3, 32, p), lerp(4, 102, p), lerp(3, 26, p))
    nd = norm(sub(sh, hip)); ant = perp(nd)
    # halter na vertical junto ao peito; mãos sob a cabeça de cima e cotovelos apontando para baixo
    hand = add(add(sh, mul(ant, 19)), mul(nd, -20))
    db = add(add(hand, mul(nd, -4)), mul(ant, 8))
    elbow = add(add(sh, mul(nd, -46)), mul(ant, 10))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee),
         'An': arm(sh, hand, elbow=elbow), 'Af': arm(add(sh, (-6, -5)), add(hand, (-4, -3)), elbow=add(elbow, (-5, -4)))}
    return J, {'front_leg': lambda cv: dumbbell_upright(cv, db, nd)}, {'quad': 1, 'glute': 0.5}


def dumbbells_hanging(sh, off=(-6, -5), fwd=2):
    hand = add(sh, (fwd, UA + FA - 3))
    return arm(sh, hand, 1), arm(add(sh, off), add(hand, off), 1), hand


@exercise('agachamento-bulgaro', phase=phase_down, k=0.92)
def ex_bulgarian(p):
    front = v(296, ANK_Y)
    rear = v(176, 247)
    hip = lerpv(v(246, 160), v(236, 222), p)
    sh = lean(hip, lerp(8, 22, p), TO)
    An, Af, hand = dumbbells_hanging(sh)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, front, (1, 0)),
         'Lf': leg(add(hip, (-6, -4)), rear, norm((-1, 0.12))), 'An': An, 'Af': Af}
    hooks = {'back': lambda cv: bench(cv, 90, 182, 252),
             'far_hand': lambda cv: dumbbell_side(cv, Af['hand'], True),
             'front': lambda cv: dumbbell_side(cv, An['hand'])}
    return J, hooks, {'quad': 1, 'glute': 0.6}


@exercise('afundo', phase=phase_down, k=0.92)
def ex_lunge(p):
    front = v(300, ANK_Y)
    rear = v(168, 298)
    hip = lerpv(v(240, 162), v(236, 228), p)
    sh = lean(hip, lerp(3, 7, p), TO)
    An, Af, _ = dumbbells_hanging(sh)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, front, (1, 0)),
         'Lf': leg(add(hip, (-6, -4)), rear, norm((0.8, 0.6))), 'An': An, 'Af': Af}
    hooks = {'far_hand': lambda cv: dumbbell_side(cv, Af['hand'], True),
             'front': lambda cv: dumbbell_side(cv, An['hand'])}
    return J, hooks, {'quad': 1, 'glute': 0.6}


@exercise('step-up', k=0.8)
def ex_stepup(p):
    front = v(286, 241)
    hip = lerpv(v(230, 168), v(279, 88), p)
    q = clamp01((p - 0.3) / 0.7)
    rear = lerpv(v(206, ANK_Y), v(262, 214), ease(q))
    sh = lean(hip, lerp(18, 4, p), TO)
    An, Af, _ = dumbbells_hanging(sh)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, front, (1, 0)),
         'Lf': leg(add(hip, (-6, -4)), rear, (1, 0.2 * q)), 'An': An, 'Af': Af}
    hooks = {'back': lambda cv: cv.box(246, 252, 346, FLOOR_Y, PAD, PAD_HI, 2),
             'far_hand': lambda cv: dumbbell_side(cv, Af['hand'], True),
             'front': lambda cv: dumbbell_side(cv, An['hand'])}
    return J, hooks, {'glute': 1, 'quad': 0.6}


# ---------- glúteos ----------
def thrust_body(p, S, ankle, a0, a1, arms_on_bar=True):
    a = lerp(a0, a1, p)
    hip = add(S, polar(a, TO))
    nd = norm(sub(S, hip)); ant = perp(nd)
    bar = add(hip, mul(ant, 15))
    hand = add(bar, (-6, -3))
    J = {'hip': hip, 'shoulder': S, 'Ln': leg(hip, ankle, (1, 0)), 'head_tilt': 18}
    J['An'] = arm(S, hand, -1) if arms_on_bar else None
    return J, bar


@exercise('hip-thrust')
def ex_hip_thrust(p):
    J, bar = thrust_body(p, v(158, 238), v(322, ANK_Y), 36, -4)
    hooks = {'back': lambda cv: (bench(cv, 56, 166, 246), plate_disc(cv, bar, 34)),
             'front': lambda cv: bar_end(cv, bar)}
    return J, hooks, {'glute': 1, 'ham': 0.35}


@exercise('hip-thrust-unilateral')
def ex_hip_thrust_uni(p):
    J, _ = thrust_body(p, v(158, 238), v(322, ANK_Y), 36, -4)
    hip = J['hip']
    # perna livre: quadril e joelho flexionados, pé no ar
    fk = add(hip, (14, -TH + 4))
    fa = add(fk, mul(norm((0.85, 0.55)), SH))
    J['Lf'] = leg(add(hip, (-6, -4)), add(fa, (-6, -4)), None, add(fk, (-6, -4)))
    J['An'] = arm(J['shoulder'], add(J['shoulder'], (18, 60)), 1)
    hooks = {'back': lambda cv: bench(cv, 56, 166, 246)}
    return J, hooks, {'glute': 1, 'ham': 0.35}


@exercise('elevacao-pelvica-maquina')
def ex_hip_thrust_machine(p):
    J, bar = thrust_body(p, v(158, 238), v(322, ANK_Y - 6), 36, -4)
    # alavanca presa no banco (pivô baixo, atrás); almofada e anilhas ficam sobre o quadril
    pivot = v(176, 292)
    hub = add(bar, (0, -6))
    def back(cv):
        cv.bar(v(40, FLOOR_Y - 2), v(360, FLOOR_Y - 2), 8)
        cv.box(286, 304, 360, FLOOR_Y - 4, FRAME_D, FRAME_E, 2)           # plataforma dos pés
        bench(cv, 56, 166, 246)
        cv.bar(v(176, FLOOR_Y), pivot, 12)
        cv.bar(pivot, hub, 10, FRAME_D, FRAME_E)                          # braço da alavanca (lado de lá)
        plate_disc(cv, hub, 32)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
    def front(cv):
        cv.rect_along(add(bar, (0, -3)), (1, 0), 22, 8, PAD, PAD_HI, 2)  # almofada sobre o quadril
        bar_end(cv, hub)
    J['An'] = arm(J['shoulder'], add(bar, (-14, -10)), -1)
    return J, {'back': back, 'front': front}, {'glute': 1, 'ham': 0.35}


@exercise('glute-bridge')
def ex_bridge(p):
    S = v(140, 296)
    J, bar = thrust_body(p, S, v(318, ANK_Y), 0, -26)
    J['head_tilt'] = 0
    J['An'] = arm(S, add(J['hip'], (6, -14)), -1)
    hooks = {'back': lambda cv: (cv.box(64, FLOOR_Y - 4, 360, FLOOR_Y, MAT), plate_disc(cv, bar, 34)),
             'front': lambda cv: bar_end(cv, bar)}
    return J, hooks, {'glute': 1, 'ham': 0.3}


@exercise('coice-maquina')
def ex_kickback_machine(p):
    hip = v(214, 188)
    sh = add(hip, polar(8, TO))
    knee_f = v(210, 268)
    an = lerpv(v(192, 262), v(80, 164), p)
    Ln = leg(hip, an)
    sole = perp(norm(ant_of(Ln['knee'], an)))
    plate_c = add(an, mul(sole, 13))
    pivot = v(232, 112)
    def back(cv):
        cv.bar(v(60, FLOOR_Y), v(400, FLOOR_Y), 10)
        cv.bar(v(330, FLOOR_Y), v(330, 268), 11)
        cv.bar(v(205, FLOOR_Y), v(205, 290), 11)
        cv.box(300, 256, 384, 268, PAD, PAD_HI, 2)                 # apoio dos cotovelos
        cv.box(176, 278, 236, 290, PAD, PAD_HI, 2)                 # apoio do joelho
        cv.box(255, 196, 300, 208, PAD, PAD_HI, 2) if False else None
        cv.bar(v(232, 112), v(232, 60), 10)
        cv.bar(v(232, 60), v(330, 60), 9)
        cv.bar(v(330, 60), v(330, 268), 9)
        cv.bar(pivot, add(pivot, mul(norm(sub(pivot, plate_c)), 36)), 8, FRAME_D, FRAME_E)
        plate_disc(cv, add(pivot, mul(norm(sub(pivot, plate_c)), 36)), 22)
    def front(cv):
        cv.bar(pivot, plate_c, 8, FRAME_D, FRAME_E)
        cv.rect_along(plate_c, perp(sole), 16, 5, (62, 64, 70), (40, 41, 46), 2)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln,
         'Lf': leg(add(hip, (-6, -4)), v(134, 274), None, knee_f),
         'An': arm(sh, v(362, 252), 1, elbow=v(318, 252)), 'head_tilt': -28}
    return J, {'back': back, 'front': front}, {'glute': 1, 'ham': 0.35}


@exercise('coice-polia')
def ex_kickback_cable(p):
    ankle_f = v(228, ANK_Y)
    _, hip, _ = stand_chain(ankle_f, 3, 3, 0)
    sh = lean(hip, 30, TO)
    a = lerp(6, -42, p)
    knee = hang(hip, a, TH)
    ankle = hang(knee, a - lerp(6, 12, p), SH)
    pulley = v(346, 300)
    def back(cv):
        column(cv, 362, 40, 34)
        top = stack(cv, 362, 300, 10, 40 * p, 3, 24)
        cv.line(v(362, 40), v(362, top), 2.5, (60, 62, 68))
        cv.circle(pulley, 7, FRAME_C, FRAME_D, 2)
    def front(cv):
        cv.line(pulley, add(ankle, (4, 4)), 2.5, (60, 62, 68))
        cv.circle(add(ankle, (0, 3)), 6, (60, 62, 68))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee),
         'Lf': leg(add(hip, (-5, -4)), ankle_f, (1, 0)), 'An': arm(sh, v(342, 142), 1)}
    return J, {'back': back, 'front': front}, {'glute': 1, 'ham': 0.35}


# ---------- posteriores ----------
def hinge(p, ankle, a_s, a_t, a_b, bar_x):
    knee, hip, sh = stand_chain(ankle, a_s, a_t, a_b)
    dx = bar_x - sh[0]
    dy = math.sqrt(max(0.0, (UA + FA - 3) ** 2 - dx * dx))
    return knee, hip, sh, v(bar_x, sh[1] + dy)


def barbell_hinge_hooks(bar, r=34):
    return {'back': lambda cv: plate_disc(cv, bar, r), 'front': lambda cv: bar_end(cv, bar)}


@exercise('stiff', phase=phase_down)
def ex_stiff(p):
    ankle = v(222, ANK_Y)
    knee, hip, sh, bar = hinge(p, ankle, lerp(3, 7, p), lerp(3, 28, p), lerp(4, 78, p), ankle[0] + 18)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': arm(sh, bar, 1), 'head_tilt': lerp(0, -30, p)}
    return J, barbell_hinge_hooks(bar), {'ham': 1, 'glute': 0.5}


@exercise('rdl', phase=phase_down)
def ex_rdl(p):
    ankle = v(222, ANK_Y)
    knee, hip, sh, hand = hinge(p, ankle, lerp(3, 9, p), lerp(3, 32, p), lerp(4, 80, p), ankle[0] + 20)
    An = arm(sh, hand, 1); Af = arm(add(sh, (-6, -5)), add(hand, (-6, -5)), 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': Af, 'head_tilt': lerp(0, -30, p)}
    hooks = {'far_hand': lambda cv: dumbbell_side(cv, Af['hand'], True), 'front': lambda cv: dumbbell_side(cv, An['hand'])}
    return J, hooks, {'ham': 1, 'glute': 0.5}


@exercise('terra')
def ex_deadlift(p):
    ankle = v(222, ANK_Y)
    knee, hip, sh = stand_chain(ankle, lerp(16, 2, p), lerp(70, 3, p), lerp(79, 3, p))
    bar = add(sh, (0, UA + FA - 3))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': arm(sh, bar, 1), 'head_tilt': lerp(-30, 0, p)}
    return J, barbell_hinge_hooks(bar), {'ham': 1, 'glute': 0.8, 'lower': 0.6}


@exercise('good-morning', phase=phase_down)
def ex_good_morning(p):
    ankle = v(222, ANK_Y)
    knee, hip, sh = stand_chain(ankle, lerp(3, 6, p), lerp(3, 22, p), lerp(4, 76, p))
    bar = barbell_on_back(sh, hip)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': back_bar_arm(sh, hip, bar), 'head_tilt': lerp(0, -30, p)}
    return J, squat_hooks(bar, 30), {'ham': 1, 'glute': 0.5, 'lower': 0.5}


@exercise('mesa-flexora')
def ex_lying_curl(p):
    hip, sh = v(214, 206), v(310, 208)
    knee = v(134, 206)
    ang = lerp(178, 292, p)
    ankle = add(knee, polar(ang, SH))
    d = polar(ang)
    roll = add(add(knee, mul(d, SH - 8)), mul(perp(d), 14))
    def back(cv):
        cv.bar(v(80, FLOOR_Y), v(400, FLOOR_Y), 10)
        cv.box(110, 220, 360, 234, PAD, PAD_HI, 2)
        cv.bar(v(150, 234), v(150, FLOOR_Y), 10); cv.bar(v(330, 234), v(330, FLOOR_Y), 10)
        cv.bar(v(340, 246), v(362, 246), 6, FRAME_D, FRAME_E)
        cv.bar(knee, add(knee, mul(d, SH - 8)), 8, FRAME_D, FRAME_E)
        cv.bar(knee, add(knee, polar(ang + 180, 34)), 8, FRAME_D, FRAME_E)
        plate_disc(cv, add(knee, polar(ang + 180, 34)), 20)
    def front(cv):
        cv.circle(roll, 11.5, (20, 20, 22)); cv.circle(roll, 10, PAD); cv.circle(roll, 4, PAD_HI)
        cv.circle(knee, 7, FRAME_C, FRAME_D, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee), 'off': (-4, -6),
         'An': arm(sh, v(350, 244), 1), 'head_tilt': -12}
    return J, {'back': back, 'front': front}, {'ham': 1}


def seated_machine(cv, knee, ang, p, hip, thigh_pad):
    cv.bar(v(86, FLOOR_Y), v(86, 92), 10); cv.bar(v(132, FLOOR_Y), v(132, 92), 10)
    cv.bar(v(80, 92), v(138, 92), 10)
    top = stack(cv, 109, 300, 8, 34 * p, 3)
    cv.line(v(109, 92), v(109, top), 2.5, (60, 62, 68))
    cv.bar(v(60, FLOOR_Y), v(380, FLOOR_Y), 10)
    cv.bar(v(220, FLOOR_Y), v(220, 242), 12)
    cv.rect_along(v(222, 236), (1, 0.03), 66, 11, PAD, PAD_HI, 2)
    cv.rect_along(v(160, 168), polar(-100), 62, 11, PAD, PAD_HI, 2)
    cv.bar(v(172, 236), v(140, 225), 8)
    cv.bar(v(150, 110), v(150, 236), 9)
    cv.bar(v(188, 250), v(210, 250), 7, FRAME_D, FRAME_E)
    if thigh_pad:
        cv.bar(add(knee, (-14, -22)), add(knee, (-14, -60)), 7)
        cv.rect_along(add(knee, (-14, -24)), (1, 0), 16, 7, PAD, PAD_HI, 2)
    cv.bar(knee, add(knee, polar(ang, SH - 6)), 9, FRAME_D, FRAME_E)
    cv.circle(knee, 9, FRAME_C, FRAME_D, 2)


def seated_body(ang):
    hip, knee = v(196, 218), v(276, 222)
    sh = add(hip, polar(-100, TO))
    ankle = add(knee, polar(ang, SH))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee), 'off': (-5, -3),
         'An': arm(sh, v(200, 250), -1)}
    return J, knee, ankle


@exercise('cadeira-extensora')
def ex_leg_extension(p):
    ang = lerp(98, 8, p)
    J, knee, ankle = seated_body(ang)
    d = polar(ang)
    roll = add(add(knee, mul(d, SH - 6)), mul(perp(d), -15))
    def front(cv):
        cv.circle(roll, 11.5, (20, 20, 22)); cv.circle(roll, 10, PAD); cv.circle(roll, 4, PAD_HI)
    return J, {'back': lambda cv: seated_machine(cv, knee, ang, p, J['hip'], True), 'front_leg': front}, {'quad': 1}


@exercise('cadeira-flexora')
def ex_seated_curl(p):
    ang = lerp(14, 112, p)
    J, knee, ankle = seated_body(ang)
    d = polar(ang)
    roll = add(add(knee, mul(d, SH - 8)), mul(perp(d), 15))
    def front(cv):
        cv.circle(roll, 11.5, (20, 20, 22)); cv.circle(roll, 10, PAD); cv.circle(roll, 4, PAD_HI)
        cv.rect_along(add(knee, (-16, -18)), (1, 0), 18, 7, PAD, PAD_HI, 2)
    return J, {'back': lambda cv: seated_machine(cv, knee, ang, p, J['hip'], False), 'front_leg': front}, {'ham': 1}


# ---------- panturrilhas ----------
def calf_foot(ball, theta):
    f = polar(theta)
    return sub(ball, mul(f, 21)), f


@exercise('panturrilha-em-pe', k=0.8)
def ex_standing_calf(p):
    ball = v(270, 289)
    ankle, f = calf_foot(ball, lerp(-24, 46, p))
    knee = add(ankle, (1, -SH)); hip = add(knee, (-1, -TH)); sh = add(hip, (2, -TO))
    lift = sh[1] - add(add(calf_foot(ball, -24)[0], (1, -SH)), (1, -TH - TO))[1]
    def back(cv):
        cv.bar(v(196, FLOOR_Y), v(196, 26), 11)
        cv.bar(v(160, FLOOR_Y - 2), v(300, FLOOR_Y - 2), 8)
        top = stack(cv, 170, 300, 9, -lift, 3, 26)
        cv.line(v(170, 26), v(170, top), 2.5, (60, 62, 68)); cv.bar(v(170, 26), v(196, 26), 6)
        cv.box(254, 297, 330, FLOOR_Y, FRAME_D, FRAME_E, 2)
        cv.bar(v(196, sh[1] - 12), add(sh, (0, -12)), 9, FRAME_D, FRAME_E)
    def pad(cv):
        cv.rect_along(add(sh, (4, -13)), (1, 0), 18, 6.5, PAD, PAD_HI, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, f, knee), 'An': arm(sh, add(sh, (24, -12)), -1)}
    return J, {'back': back, 'mid': pad}, {'calf': 1}


@exercise('panturrilha-sentada')
def ex_seated_calf(p):
    hip = v(190, 220)
    ball = v(292, 296)
    ankle, f = calf_foot(ball, lerp(-24, 42, p))
    Ln = leg(hip, ankle, f)
    knee = Ln['knee']
    def back(cv):
        cv.bar(v(80, FLOOR_Y), v(400, FLOOR_Y), 10)
        cv.box(120, 234, 236, 248, PAD, PAD_HI, 2)
        cv.bar(v(178, 248), v(178, FLOOR_Y), 11)
        cv.box(282, 303, 352, FLOOR_Y, FRAME_D, FRAME_E, 2)
        cv.bar(v(330, FLOOR_Y), v(330, knee[1] - 18), 10)
        cv.bar(v(330, knee[1] - 18), v(372, knee[1] - 30), 8, FRAME_D, FRAME_E)
        plate_disc(cv, v(372, knee[1] - 30), 22)
    def front(cv):
        cv.bar(add(knee, (4, -18)), v(330, knee[1] - 18), 8, FRAME_D, FRAME_E)
        cv.rect_along(add(knee, (-8, -18)), (1, 0), 20, 7, PAD, PAD_HI, 2)
    sh = lean(hip, -2, TO)
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln, 'An': arm(sh, add(knee, (-14, -24)), 1)}
    return J, {'back': back, 'front_leg': front}, {'calf': 1}


@exercise('panturrilha-unilateral', k=0.8)
def ex_single_calf(p):
    ball = v(268, 289)
    ankle, f = calf_foot(ball, lerp(-24, 46, p))
    knee = add(ankle, (1, -SH)); hip = add(knee, (-1, -TH)); sh = add(hip, (2, -TO))
    hf = add(hip, (-6, -4))
    fa = add(ankle, (-34, -34))
    An, _, _ = dumbbells_hanging(sh)
    Af = arm(add(sh, (-6, -5)), v(330, sh[1] + 44), -1)
    def back(cv):
        cv.bar(v(338, FLOOR_Y), v(338, 30), 10)
        cv.box(242, 297, 350, FLOOR_Y, PAD, PAD_HI, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, f, knee),
         'Lf': leg(hf, fa, None, ik(hf, fa, TH, SH, -1), foot_rot=30), 'An': An, 'Af': Af}
    return J, {'back': back, 'front': lambda cv: dumbbell_side(cv, An['hand'])}, {'calf': 1}


# ================= etapa 2: tronco e braços =================
def deg(vec): return math.degrees(math.atan2(vec[1], vec[0]))


def limb(sh, a_up, a_fore):
    """Braço por ângulos absolutos na tela (0 = frente, 90 = baixo, -90 = cima, 180 = trás)."""
    el = add(sh, polar(a_up, UA))
    return {'sh': sh, 'elbow': el, 'hand': add(el, polar(a_fore, FA))}


def far_of(A, off=(-6, -5)):
    return {k_: add(val, off) for k_, val in A.items()}


def standing_body(ankle_x=226, a_b=2, a_s=2, a_t=2):
    ankle = v(ankle_x, ANK_Y)
    knee, hip, sh = stand_chain(ankle, a_s, a_t, a_b)
    return ankle, knee, hip, sh


def seated_legs(hip):
    knee = add(hip, (TH - 3, 6))
    return leg(hip, v(knee[0] + 8, ANK_Y), (1, 0), knee)


SEAT_HIP_Y = ANK_Y - SH - 5


def stool(cv, x0, x1):
    bench(cv, x0, x1, SEAT_HIP_Y + 14)


def backrest(cv, hip, ang, length=96):
    """Encosto atrás do tronco, inclinado ang graus da vertical (negativo = reclinado)."""
    d = polar(-90 + ang); n = mul(perp(d), -1)
    c = add(add(hip, mul(d, length * 0.55)), mul(n, 18))
    cv.rect_along(c, d, length * 0.55, 8, PAD, PAD_HI, 2)
    cv.bar(add(c, mul(d, -length * 0.4)), v(c[0] - 6, FLOOR_Y), 8)


def barbell_at(hand, r=28):
    return {'back': lambda cv: plate_disc(cv, hand, r), 'front': lambda cv: bar_end(cv, hand)}


def dumbbells(An, Af):
    return {'far_hand': lambda cv: dumbbell_side(cv, Af['hand'], True), 'front': lambda cv: dumbbell_side(cv, An['hand'])}


def merge(*hs):
    out = {}
    for h in hs:
        for k_, f in h.items():
            if k_ in out:
                g = out[k_]; out[k_] = (lambda a, b: lambda cv: (a(cv), b(cv)))(g, f)
            else:
                out[k_] = f
    return out


def cable(a, b):
    return lambda cv: cv.line(a, b, 2.5, (60, 62, 68))


def tower(x, top=36, p=0.0, w=34):
    def draw(cv):
        column(cv, x, top, w)
        y = stack(cv, x, 300, 9, 40 * p, 3, w - 10)
        cv.line(v(x, top), v(x, y), 2.5, (60, 62, 68))
    return draw


def pulley(c):
    return lambda cv: cv.circle(c, 7, FRAME_C, FRAME_D, 2)


# ---------- bíceps ----------
@exercise('rosca-direta', k=0.9)
def ex_curl(p):
    ankle, knee, hip, sh = standing_body()
    An = limb(sh, 86, lerp(82, -62, p))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, barbell_at(An['hand'], 26), {'biceps': 1}


@exercise('rosca-alternada', k=0.9)
def ex_curl_alt(p):
    ankle, knee, hip, sh = standing_body()
    An = limb(sh, 86, lerp(82, -62, p))
    Af = far_of(limb(sh, 86, lerp(82, -62, 1 - p)))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': Af}
    return J, dumbbells(An, Af), {'biceps': 1}


@exercise('rosca-martelo', k=0.9)
def ex_hammer(p):
    ankle, knee, hip, sh = standing_body()
    fa = lerp(82, -62, p)
    An = limb(sh, 86, fa); Af = far_of(An)
    ax = perp(polar(fa))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': Af}
    return J, {'far_hand': lambda cv: dumbbell_upright(cv, Af['hand'], ax), 'front': lambda cv: dumbbell_upright(cv, An['hand'], ax)}, {'biceps': 1}


@exercise('rosca-scott')
def ex_preacher(p):
    hip = v(176, SEAT_HIP_Y)
    sh = lean(hip, 14, TO)
    An = limb(sh, 48, lerp(40, -105, p))
    d = polar(48); post = perp(d)
    pad_c = add(add(sh, mul(d, 30)), mul(post, 11))
    def back(cv):
        stool(cv, 130, 220)
        cv.rect_along(pad_c, d, 34, 7, PAD, PAD_HI, 2)
        cv.bar(add(pad_c, mul(post, 6)), v(pad_c[0] + 6, FLOOR_Y), 9)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An}
    return J, merge({'back': back}, barbell_at(An['hand'], 24)), {'biceps': 1}


@exercise('rosca-polia', k=0.9)
def ex_cable_curl(p):
    ankle, knee, hip, sh = standing_body(214, 4)
    An = limb(sh, 86, lerp(82, -62, p))
    pl = v(352, 300)
    hooks = {'back': lambda cv: (tower(370, 40, p)(cv), pulley(pl)(cv)),
             'front': lambda cv: (cable(pl, An['hand'])(cv), cv.circle(An['hand'], 5, METAL))}
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, hooks, {'biceps': 1}


@exercise('rosca-concentrada')
def ex_concentration(p):
    hip = v(178, SEAT_HIP_Y)
    sh = lean(hip, 40, TO)
    An = limb(sh, 92, lerp(92, -78, p))
    Ln = seated_legs(hip)
    Af = arm(add(sh, (-6, -5)), add(Ln['knee'], (-4, -12)), 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln, 'An': An, 'Af': Af}
    return J, {'back': lambda cv: stool(cv, 120, 220), 'front': lambda cv: dumbbell_side(cv, An['hand'])}, {'biceps': 1}


@exercise('rosca-inclinada')
def ex_incline_curl(p):
    hip = v(206, SEAT_HIP_Y)
    sh = lean(hip, -38, TO)
    An = limb(sh, 94, lerp(92, -55, p)); Af = far_of(An)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An, 'Af': Af, 'head_tilt': 12}
    return J, merge({'back': lambda cv: (stool(cv, 140, 250), backrest(cv, hip, -38, 110))}, dumbbells(An, Af)), {'biceps': 1}


# ---------- tríceps ----------
def pushdown(p, rope):
    ankle, knee, hip, sh = standing_body(212, 10, 3, 4)
    An = limb(sh, 98, lerp(-62, 88 if not rope else 96, p))
    top = v(338, 40)
    def front(cv):
        cable(top, An['hand'])(cv)
        if rope:
            for dx in (-5, 5): cv.line(An['hand'], add(An['hand'], (dx, 12)), 3.5, (180, 150, 90))
        else:
            cv.circle(An['hand'], 5, METAL)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, {'back': lambda cv: (tower(358, 30, p)(cv), pulley(top)(cv)), 'front': front}, {'triceps': 1}


@exercise('triceps-pulley', k=0.9)
def ex_pushdown(p): return pushdown(p, False)


@exercise('triceps-corda', k=0.9)
def ex_rope(p): return pushdown(p, True)


def supine_bench_body(incline=0):
    """Deitada no banco, cabeça à esquerda. incline em graus (0 = reto)."""
    hip = v(250, 229)
    sh = add(hip, polar(180 + incline, TO))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(322, ANK_Y), (1, 0)), 'head_tilt': 8}
    return J, hip, sh


def flat_bench(cv):
    bench(cv, 112, 270, 243)


def incline_bench(cv, hip, sh):
    bench(cv, 196, 282, 243)
    d = norm(sub(sh, hip)); n = mul(perp(d), -1)
    c = add(add(hip, mul(d, 60)), mul(n, 21))
    cv.rect_along(c, d, 62, 7, PAD, PAD_HI, 2)
    cv.bar(add(c, mul(d, 40)), v(c[0] - 30, FLOOR_Y), 8)


@exercise('triceps-testa', phase=phase_down)
def ex_skull(p):
    J, hip, sh = supine_bench_body()
    J['An'] = limb(sh, -98, lerp(-98, -205, p))
    return J, merge({'back': flat_bench}, barbell_at(J['An']['hand'], 24)), {'triceps': 1}


@exercise('triceps-frances', phase=phase_down, k=0.9)
def ex_overhead_ext(p):
    hip = v(196, SEAT_HIP_Y)
    sh = lean(hip, 2, TO)
    fa = lerp(-90, -232, p)
    An = limb(sh, -96, fa)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An}
    return J, {'back': lambda cv: stool(cv, 130, 240), 'front': lambda cv: dumbbell_upright(cv, add(An['hand'], polar(fa, 4)), polar(fa))}, {'triceps': 1}


@exercise('triceps-coice')
def ex_kickback(p):
    ankle = v(196, ANK_Y)
    knee, hip, sh = stand_chain(ankle, 10, 22, 68)
    back_ang = deg(sub(hip, sh)) - 8
    An = limb(sh, back_ang, lerp(92, back_ang, p))
    Af = arm(add(sh, (-6, -5)), v(330, 236), 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': Af, 'head_tilt': -28}
    return J, {'back': lambda cv: bench(cv, 300, 400, 243), 'front': lambda cv: dumbbell_side(cv, An['hand'])}, {'triceps': 1}


@exercise('mergulho', phase=phase_down)
def ex_dips(p):
    hand = v(252, 150)
    sh = add(hand, (lerp(-4, -20, p), lerp(-90, -50, p)))
    hip = add(sh, polar(90 + 14, TO))
    knee = add(hip, polar(66, TH)); ankle = add(knee, polar(192, SH))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee, foot_rot=40), 'An': arm(sh, hand, 1)}
    def back(cv):
        cv.bar(v(hand[0] + 6, hand[1] + 4), v(hand[0] + 6, FLOOR_Y), 10)
        cv.bar(v(hand[0] - 40, FLOOR_Y - 2), v(hand[0] + 50, FLOOR_Y - 2), 8)
    def front(cv):
        cv.circle(add(hand, (0, 4)), 7, FRAME_C, FRAME_D, 2)
    return J, {'back': back, 'front': front}, {'triceps': 1, 'chest': 0.4}


def bench_press(p, incline=0, dumbbell=False, focus=None):
    J, hip, sh = supine_bench_body(incline)
    top = add(sh, (6 if incline else 12, -92))
    low = add(sh, (24 if incline else 20, -22))
    hand = lerpv(low, top, p)
    An = arm(sh, hand, 1)
    J['An'] = An
    bench_draw = flat_bench if not incline else (lambda cv: incline_bench(cv, hip, sh))
    if dumbbell:
        Af = far_of(An); J['Af'] = Af
        return J, merge({'back': bench_draw}, dumbbells(An, Af)), focus
    def rack(cv):
        cv.bar(v(sh[0] - 14, FLOOR_Y), v(sh[0] - 14, 120), 9)
        cv.bar(v(sh[0] - 14, 132), v(sh[0] + 2, 132), 6, FRAME_D, FRAME_E)
    return J, merge({'back': lambda cv: (rack(cv), bench_draw(cv))}, barbell_at(hand, 30)), focus


@exercise('supino-reto')
def ex_bench(p): return bench_press(p, focus={'chest': 1, 'triceps': 0.5})


@exercise('supino-fechado')
def ex_close_bench(p): return bench_press(p, focus={'triceps': 1, 'chest': 0.5})


@exercise('supino-reto-halteres')
def ex_db_bench(p): return bench_press(p, dumbbell=True, focus={'chest': 1, 'triceps': 0.5})


@exercise('supino-inclinado')
def ex_incline_bench(p): return bench_press(p, incline=34, focus={'chest': 1, 'delt': 0.6})


@exercise('supino-inclinado-halteres')
def ex_incline_db(p): return bench_press(p, incline=34, dumbbell=True, focus={'chest': 1, 'delt': 0.6})


@exercise('supino-maquina')
def ex_machine_press(p):
    hip = v(184, SEAT_HIP_Y)
    sh = lean(hip, -8, TO)
    hand = lerpv(add(sh, (30, 10)), add(sh, (88, 4)), p)
    An = arm(sh, hand, 1)
    pivot = add(sh, (-4, -96))
    def back(cv):
        stool(cv, 120, 230); backrest(cv, hip, -8)
        cv.bar(v(pivot[0] - 8, FLOOR_Y), pivot, 10)
        cv.bar(pivot, hand, 8, FRAME_D, FRAME_E)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An}
    return J, {'back': back, 'front': lambda cv: cv.circle(hand, 5, METAL)}, {'chest': 1, 'triceps': 0.5}


@exercise('flexao', phase=phase_down)
def ex_pushup(p):
    ankle = v(108, 300)
    def body(th):
        d = (math.cos(math.radians(th)), -math.sin(math.radians(th)))
        return add(ankle, mul(d, SH)), add(ankle, mul(d, SH + TH)), add(ankle, mul(d, SH + TH + TO))
    _, _, sh_top = body(19)
    hand = v(sh_top[0] + 4, 312)
    th = solve(lambda a: body(a)[2][1], 3, 19, lerp(sh_top[1], 284, p))
    knee, hip, sh = body(th)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (0.15, 1), knee), 'An': arm(sh, hand, 1), 'head_tilt': -6}
    return J, {'back': lambda cv: cv.box(70, FLOOR_Y - 4, 400, FLOOR_Y, MAT)}, {'chest': 1, 'triceps': 0.6}


# ---------- costas ----------
def pulldown_machine(p, top_hand, bottom_hand, lean_from, lean_to, focus, vgrip=False):
    hip = v(196, SEAT_HIP_Y)
    sh = lean(hip, lerp(lean_from, lean_to, p), TO)
    hand = lerpv(add(sh, top_hand), add(sh, bottom_hand), p)
    An = arm(sh, hand, -1)
    Ln = seated_legs(hip)
    pl = v(hand[0], 16)
    def back(cv):
        stool(cv, 130, 240)
        cv.bar(v(120, FLOOR_Y), v(120, 16), 11)
        cv.bar(v(120, 16), v(hand[0] + 16, 16), 9)
        y = stack(cv, 98, 300, 9, -40 * p if False else 40 * p, 3, 24)
        cv.bar(v(Ln['knee'][0] - 4, Ln['knee'][1] - 20), v(140, 252), 7)
    def front(cv):
        cable(pl, hand)(cv)
        cv.rect_along(add(Ln['knee'], (-6, -19)), (1, 0), 14, 6, PAD, PAD_HI, 2)
        if vgrip: cv.line(hand, add(hand, (6, 10)), 4, METAL)
        else: cv.circle(hand, 5, METAL)
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln, 'An': An}
    return J, {'back': back, 'front': front}, focus


@exercise('puxada-frontal', k=0.9)
def ex_lat_pulldown(p): return pulldown_machine(p, (14, -92), (24, -4), 8, 18, {'back': 1, 'biceps': 0.5})


@exercise('puxada-triangulo', k=0.9)
def ex_vbar_pulldown(p): return pulldown_machine(p, (16, -92), (26, 10), 10, 26, {'back': 1, 'biceps': 0.5}, vgrip=True)


@exercise('barra-fixa')
def ex_pullup(p):
    hand = v(250, 34)
    sh = add(hand, (lerp(-8, -14, p), lerp(84, 38, p)))
    hip = lean(sh, 172, TO)
    knee = add(hip, polar(62, TH)); ankle = add(knee, polar(196, SH))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee, foot_rot=50), 'An': arm(sh, hand, 1)}
    def back(cv):
        cv.bar(v(150, 30), v(340, 30), 8)
        cv.bar(v(330, 30), v(330, FLOOR_Y), 10)
    return J, {'back': back, 'front': lambda cv: cv.circle(add(hand, (0, -4)), 6, METAL)}, {'back': 1, 'biceps': 0.6}


def row_arm(sh, hand, pref):
    """Braço de remada: entre as duas soluções, o cotovelo vai para o lado de pref (para trás do tronco)."""
    hand = reach(sh, hand, UA + FA - 0.5)
    a, b = ik(sh, hand, UA, FA, 1), ik(sh, hand, UA, FA, -1)
    el = a if dot(sub(a, sh), pref) >= dot(sub(b, sh), pref) else b
    return {'sh': sh, 'hand': hand, 'elbow': el}


def bent_row(p, a_b, hand_to, plate=True, landmine=False):
    ankle = v(204, ANK_Y)
    knee, hip, sh = stand_chain(ankle, 12, 30, a_b)
    hand = lerpv(add(sh, (4, 90)), add(hip, hand_to), p)
    An = row_arm(sh, hand, add(norm(sub(hip, sh)), (0, -0.6)))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'head_tilt': -24}
    if landmine:
        base = v(70, FLOOR_Y - 6)
        end = add(hand, mul(norm(sub(hand, base)), 34))
        return J, {'back': lambda cv: (cv.bar(base, end, 7, METAL, FRAME_E), plate_disc(cv, add(hand, mul(norm(sub(hand, base)), 22)), 24)),
                   'front': lambda cv: cv.circle(hand, 5, METAL)}, {'back': 1, 'biceps': 0.5}
    return J, barbell_at(hand, 30), {'back': 1, 'biceps': 0.5}


@exercise('remada-curvada')
def ex_bent_row(p): return bent_row(p, 58, (34, 2))


@exercise('remada-cavalinho')
def ex_tbar(p): return bent_row(p, 50, (40, -14), landmine=True)


@exercise('remada-unilateral')
def ex_one_arm_row(p):
    hip, sh = v(232, 156), v(326, 166)
    kf = v(244, 232); af = v(170, 236)
    hand_low = add(sh, (2, 92))
    hand = lerpv(hand_low, add(hip, (34, 14)), p)
    An = row_arm(sh, hand, add(norm(sub(hip, sh)), (0, -0.6)))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(214, ANK_Y), (1, 0)),
         'Lf': leg(add(hip, (-6, -4)), af, None, kf, foot_rot=60),
         'An': An, 'Af': arm(add(sh, (-6, -5)), v(338, 236), 1), 'head_tilt': -16}
    return J, {'back': lambda cv: bench(cv, 160, 360, 243), 'front': lambda cv: dumbbell_side(cv, An['hand'])}, {'back': 1, 'biceps': 0.5}


@exercise('remada-baixa')
def ex_seated_row(p):
    hip = v(150, 252)
    sh = lean(hip, lerp(18, -6, p), TO)
    ankle = v(300, 260)
    hand = lerpv(add(sh, polar(14, 90)), add(hip, (34, -40)), p)
    An = row_arm(sh, hand, (-1, 0.4))
    pl = v(388, 262)
    def back(cv):
        cv.bar(v(60, FLOOR_Y - 2), v(420, FLOOR_Y - 2), 8)
        cv.box(90, 266, 250, 280, PAD, PAD_HI, 2)
        cv.bar(v(120, 280), v(120, FLOOR_Y), 9); cv.bar(v(230, 280), v(230, FLOOR_Y), 9)
        cv.poly([(306, 230), (318, 230), (318, 300), (306, 300)], FRAME_D, FRAME_E, 2)
        tower(404, 60, p, 30)(cv)
        pulley(pl)(cv)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (0, -1)), 'An': An}
    return J, {'back': back, 'front': lambda cv: (cable(pl, hand)(cv), cv.line(hand, add(hand, (6, 10)), 4, METAL))}, {'back': 1, 'biceps': 0.5}


@exercise('remada-maquina')
def ex_machine_row(p):
    hip = v(176, SEAT_HIP_Y)
    sh = lean(hip, 12, TO)
    hand = lerpv(add(sh, (86, 18)), add(sh, (22, 24)), p)
    An = row_arm(sh, hand, (-1, 0.4))
    pivot = v(sh[0] + 120, 262)
    def back(cv):
        stool(cv, 120, 220)
        cv.bar(v(pivot[0], FLOOR_Y), pivot, 10)
        cv.bar(pivot, hand, 8, FRAME_D, FRAME_E)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
    def pad(cv):
        c = add(sh, (30, 24))
        cv.rect_along(c, (0, 1), 36, 7, PAD, PAD_HI, 2)
        cv.bar(add(c, (8, 30)), v(c[0] + 8, FLOOR_Y), 8)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An}
    return J, {'back': back, 'front_leg': pad, 'front': lambda cv: cv.circle(hand, 5, METAL)}, {'back': 1, 'biceps': 0.5}


@exercise('pulldown-corda', k=0.84)
def ex_straight_pulldown(p):
    ankle = v(214, ANK_Y)
    knee, hip, sh = stand_chain(ankle, 8, 16, 26)
    ang = lerp(-36, 74, p)
    An = limb(sh, ang, ang)
    top = v(372, 40)
    def front(cv):
        cable(top, An['hand'])(cv)
        for dx in (-5, 5): cv.line(An['hand'], add(An['hand'], (dx, 12)), 3.5, (180, 150, 90))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': far_of(An)}
    return J, {'back': lambda cv: (tower(392, 30, p)(cv), pulley(top)(cv)), 'front': front}, {'back': 1}


@exercise('encolhimento', k=0.9)
def ex_shrug(p):
    ankle, knee, hip, _ = standing_body()
    sh = add(lean(hip, 2, TO), (0, -10 * p))
    An, Af, _ = dumbbells_hanging(sh)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': Af}
    return J, dumbbells(An, Af), {'traps': 1}


# ---------- ombros ----------
def seated_press(p, mode):
    hip = v(196, SEAT_HIP_Y)
    sh = lean(hip, -4, TO)
    hand = lerpv(add(sh, (14, -18)), add(sh, (4, -92)), p)
    An = arm(sh, hand, 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': seated_legs(hip), 'An': An}
    base = {'back': lambda cv: (stool(cv, 140, 250), backrest(cv, hip, -4, 110))}
    if mode == 'db':
        Af = far_of(An); J['Af'] = Af
        return J, merge(base, dumbbells(An, Af)), {'delt': 1, 'triceps': 0.5}
    pivot = add(sh, (-70, -40))
    def lever(cv):
        cv.bar(pivot, hand, 8, FRAME_D, FRAME_E); cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
    return J, merge(base, {'back': lever, 'front': lambda cv: cv.circle(hand, 5, METAL)}), {'delt': 1, 'triceps': 0.5}


@exercise('desenvolvimento-halteres', k=0.86)
def ex_db_press(p): return seated_press(p, 'db')


@exercise('desenvolvimento-maquina', k=0.86)
def ex_machine_shoulder(p): return seated_press(p, 'machine')


@exercise('desenvolvimento-barra', k=0.76)
def ex_ohp(p):
    ankle, knee, hip, sh = standing_body(226, 1)
    hand = lerpv(add(sh, (22, -6)), add(sh, (2, -92)), p)
    An = arm(sh, hand, 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'head_tilt': lerp(-10, 0, p)}
    return J, barbell_at(hand, 28), {'delt': 1, 'triceps': 0.5}


@exercise('elevacao-frontal', k=0.9)
def ex_front_raise(p):
    ankle, knee, hip, sh = standing_body()
    ang = lerp(84, -4, p)
    An = limb(sh, ang, ang - 4)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, {'front': lambda cv: dumbbell_side(cv, An['hand'])}, {'delt': 1}


@exercise('face-pull', k=0.9)
def ex_face_pull(p):
    ankle, knee, hip, sh = standing_body(200, -4)
    # cotovelos na altura dos ombros: da frente (braços estendidos) até ao lado do corpo; mãos chegam ao rosto
    elbow = lerpv(add(sh, polar(-6, UA)), add(sh, (-12, -2)), ease(p))
    hand = lerpv(add(sh, polar(-10, UA + FA - 2)), add(sh, (16, -32)), p)
    An = {'sh': sh, 'elbow': elbow, 'hand': hand}
    top = v(372, sh[1] - 30)
    def front(cv):
        cable(top, hand)(cv)
        for dy in (-5, 5): cv.line(hand, add(hand, (-6, dy)), 3.5, (180, 150, 90))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, {'back': lambda cv: (tower(392, 30, p)(cv), pulley(top)(cv)), 'front': front}, {'delt': 1, 'traps': 0.6}


@exercise('remada-alta', k=0.9)
def ex_upright_row(p):
    ankle, knee, hip, sh = standing_body()
    hand = lerpv(add(sh, (8, 90)), add(sh, (16, 14)), p)
    elbow = add(sh, polar(lerp(88, 196, p), UA * lerp(1, 0.6, p)))
    An = {'sh': sh, 'elbow': elbow, 'hand': hand}
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An}
    return J, barbell_at(hand, 24), {'delt': 1, 'traps': 0.7}


# ---------- abdômen e lombar ----------
def mat(cv): cv.box(60, FLOOR_Y - 4, 400, FLOOR_Y, MAT)


@exercise('abdominal-crunch')
def ex_crunch(p):
    hip = v(244, 300)
    a = lerp(0, 34, p)
    sh = add(hip, (-math.cos(math.radians(a)) * TO, -math.sin(math.radians(a)) * TO))
    nd = norm(sub(sh, hip)); ant = perp(nd)
    headc = add(sh, mul(nd, NK))
    hand = add(add(headc, mul(ant, -12)), mul(nd, 4))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(326, ANK_Y), (1, 0)), 'An': arm(sh, hand, -1), 'head_tilt': lerp(0, 16, p)}
    return J, {'back': mat}, {'abs': 1}


@exercise('abdominal-polia')
def ex_cable_crunch(p):
    knee = v(232, 302)
    hip = add(knee, (-4, -TH))
    sh = lean(hip, lerp(10, 78, p), TO)
    nd = norm(sub(sh, hip)); ant = perp(nd)
    hand = add(add(sh, mul(nd, 18)), mul(ant, 12))
    top = v(140, 30)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(156, 306), None, knee, foot_rot=60), 'An': arm(sh, hand, -1), 'head_tilt': lerp(0, 18, p)}
    return J, {'back': lambda cv: (tower(120, 24, p)(cv), pulley(top)(cv), mat(cv)), 'front': cable(top, hand)}, {'abs': 1}


@exercise('abdominal-maquina')
def ex_machine_crunch(p):
    hip = v(200, SEAT_HIP_Y)
    sh = lean(hip, lerp(-6, 44, p), TO)
    nd = norm(sub(sh, hip)); ant = perp(nd)
    hand = add(add(sh, mul(ant, 12)), mul(nd, 10))              # alças junto aos ombros
    elbow = add(add(sh, mul(ant, 20)), mul(nd, -40))             # cotovelos para baixo, à frente do tronco
    pad = add(add(sh, mul(ant, 16)), mul(nd, -18))               # almofada no peito
    pivot = add(hip, (18, -34))
    Ln = seated_legs(hip)
    def back(cv):
        cv.bar(v(60, FLOOR_Y - 2), v(360, FLOOR_Y - 2), 8)
        stool(cv, 130, 250)
        cv.rect_along(add(lean(hip, -6, 52), (-20, 0)), polar(-96), 46, 8, PAD, PAD_HI, 2)   # encosto
        tower(96, 40, p, 30)(cv)
        cv.bar(v(96, 40), v(150, 40), 6); cv.line(v(150, 40), v(150, 150), 2.5, (60, 62, 68))
        cv.bar(v(Ln['ankle'][0] + 4, FLOOR_Y), v(Ln['ankle'][0] + 4, Ln['ankle'][1] - 14), 8)
    def front(cv):
        cv.bar(pivot, pad, 8, FRAME_D, FRAME_E)
        cv.bar(pad, hand, 6, FRAME_D, FRAME_E)
        cv.rect_along(pad, nd, 14, 6, PAD, PAD_HI, 2)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
        cv.circle(add(Ln['ankle'], (6, -14)), 8, PAD, PAD_HI, 2)                         # rolo dos pés
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln, 'An': {'sh': sh, 'elbow': elbow, 'hand': hand}, 'head_tilt': lerp(0, 14, p)}
    return J, {'back': back, 'front_leg': lambda cv: None, 'front': front}, {'abs': 1}


@exercise('prancha')
def ex_plank(p):
    ankle = v(110, 300)
    th = 9 + 1.2 * p
    d = (math.cos(math.radians(th)), -math.sin(math.radians(th)))
    knee = add(ankle, mul(d, SH)); hip = add(knee, mul(d, TH)); sh = add(hip, mul(d, TO))
    elbow = v(sh[0] + 2, 304)
    An = {'sh': sh, 'elbow': elbow, 'hand': add(elbow, (FA, 2))}
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (0.15, 1), knee), 'An': An, 'head_tilt': -8}
    return J, {'back': mat}, {'abs': 0.55 + 0.45 * p, 'lower': 0.3}


@exercise('elevacao-pernas')
def ex_leg_raise(p):
    sh, hip = v(148, 300), v(244, 300)
    a = lerp(0, 84, p)
    d = (math.cos(math.radians(a)), -math.sin(math.radians(a)))
    knee = add(hip, mul(d, TH)); ankle = add(knee, mul(d, SH))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee, foot_rot=-60),
         'An': {'sh': sh, 'elbow': add(sh, (UA, 6)), 'hand': add(sh, (UA + FA, 8))}}
    return J, {'back': mat}, {'abs': 1}


@exercise('roda-abdominal', phase=phase_down)
def ex_ab_wheel(p):
    knee = v(196, 302)
    a = lerp(8, 58, p)
    hip = add(knee, polar(-90 + a, TH))
    sh = add(hip, polar(-90 + a + lerp(46, 30, p), TO))
    dy = 298 - sh[1]
    hand = v(sh[0] + math.sqrt(max(0, 92 ** 2 - dy * dy)), 298)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(122, 306), None, knee, foot_rot=60), 'An': arm(sh, hand, -1), 'head_tilt': -20}
    def wheel(cv):
        cv.circle(add(hand, (0, 6)), 14, (20, 20, 22)); cv.circle(add(hand, (0, 6)), 12, PLATE); cv.circle(add(hand, (0, 6)), 4, METAL)
    return J, {'back': mat, 'front': wheel}, {'abs': 1, 'lower': 0.3}


def roman_chair(p, focus):
    ankle = v(140, 276)
    knee = add(ankle, polar(-40, SH)); hip = add(knee, polar(-40, TH))
    sh = add(hip, polar(lerp(70, -36, p), TO))
    nd = norm(sub(sh, hip)); ant = perp(nd)
    hand = add(add(sh, mul(ant, 14)), mul(nd, -26))
    def back(cv):
        cv.bar(v(110, FLOOR_Y - 2), v(320, FLOOR_Y - 2), 8)
        cv.bar(v(130, FLOOR_Y), v(130, 290), 10)
        cv.bar(v(130, 290), add(hip, (12, 18)), 10)
        cv.rect_along(add(add(hip, mul(polar(-40), 4)), mul(perp(polar(-40)), 18)), polar(-40), 18, 7, PAD, PAD_HI, 2)
        cv.box(118, 284, 162, 290, FRAME_D, FRAME_E, 2)
        cv.circle(add(ankle, (-12, -2)), 7, PAD, PAD_HI, 2)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee, foot_rot=40), 'An': arm(sh, hand, 1)}
    return J, {'back': back}, focus


@exercise('hiperextensao-lombar')
def ex_back_ext(p): return roman_chair(p, {'lower': 1, 'glute': 0.5})


@exercise('hiperextensao-gluteo')
def ex_back_ext_glute(p): return roman_chair(p, {'glute': 1, 'ham': 0.5})


@exercise('superman')
def ex_superman(p):
    hip = v(200, 298)
    sh = add(hip, polar(-lerp(0, 12, p), TO))
    d = polar(180 + lerp(0, 10, p))
    knee = add(hip, mul(d, TH)); ankle = add(knee, mul(d, SH))
    An = limb(sh, -lerp(2, 16, p), -lerp(2, 16, p))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee, foot_rot=-80), 'An': An, 'Af': far_of(An), 'head_tilt': -10}
    return J, {'back': mat}, {'lower': 1, 'glute': 0.5}


@exercise('bird-dog')
def ex_bird_dog(p):
    hip, sh = v(196, 220), v(292, 222)
    kn = v(198, 300)
    An = limb(sh, lerp(90, -4, p), lerp(90, -4, p))
    Af = arm(add(sh, (-6, -4)), v(286, 312), 1)
    fk = add(hip, polar(lerp(92, 180, p), TH)); fa = add(fk, polar(lerp(180, 180, p), SH))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(122, 306), None, kn, foot_rot=60),
         'Lf': leg(add(hip, (-6, -4)), add(fa, (-6, -4)), None, add(fk, (-6, -4)), foot_rot=lerp(60, -70, p)),
         'An': An, 'Af': Af, 'head_tilt': -10}
    return J, {'back': mat}, {'lower': 1, 'glute': 0.6}


# ---------- pernas (sobras da etapa 1) ----------
@exercise('agachamento-sumo', phase=phase_down, k=0.92)
def ex_sumo(p):
    ankle = v(232, ANK_Y)
    knee, hip, sh = stand_chain(ankle, lerp(3, 26, p), lerp(4, 88, p), lerp(3, 22, p))
    hand = add(sh, (6, UA + FA - 4))
    An = arm(sh, hand, 1)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': far_of(An)}
    return J, {'front': lambda cv: dumbbell_upright(cv, add(hand, (0, 16)), (0, 1))}, {'glute': 1, 'quad': 0.6}


@exercise('sissy-squat', phase=phase_down, k=0.9)
def ex_sissy(p):
    ball = v(250, 312)
    ankle = add(ball, (-16, -12))
    knee = add(ankle, polar(-90 + lerp(6, 64, p), SH))
    hip = add(knee, polar(-90 - lerp(4, 30, p), TH))
    sh = add(hip, polar(-90 - lerp(4, 30, p), TO))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, norm(sub(ball, ankle)), knee),
         'An': arm(sh, v(334, 150), 1)}
    return J, {'back': lambda cv: cv.bar(v(344, FLOOR_Y), v(344, 40), 10)}, {'quad': 1}


@exercise('nordic', phase=phase_down)
def ex_nordic(p):
    knee = v(214, 300)
    a = lerp(0, 64, p)
    hip = add(knee, polar(-90 + a, TH))
    sh = add(hip, polar(-90 + a, TO))
    nd = norm(sub(sh, hip)); ant = perp(nd)
    hand = add(add(sh, mul(ant, 30)), mul(nd, -30))
    def back(cv):
        mat(cv)
        cv.circle(v(140, 290), 9, PAD, PAD_HI, 2)
        cv.bar(v(140, 290), v(140, FLOOR_Y), 7)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, v(138, 306), None, knee, foot_rot=60), 'An': arm(sh, hand, 1)}
    return J, {'back': back}, {'ham': 1}


@exercise('flexora-em-pe', k=0.92)
def ex_standing_curl(p):
    ankle_f = v(214, ANK_Y)
    _, hip, _ = stand_chain(ankle_f, 3, 3, 0)
    sh = lean(hip, 16, TO)
    knee = hang(hip, -4, TH)
    ang = lerp(92, 205, p)
    ankle = add(knee, polar(ang, SH))
    d = polar(ang)
    roll = add(add(knee, mul(d, SH - 8)), mul(perp(d), 14))
    def back(cv):
        cv.bar(v(300, FLOOR_Y), v(300, 120), 11)
        cv.bar(v(170, FLOOR_Y - 2), v(330, FLOOR_Y - 2), 8)
        cv.rect_along(add(hip, (34, -40)), polar(-74), 34, 7, PAD, PAD_HI, 2)
        cv.bar(add(knee, (24, 0)), v(300, knee[1]), 8)
        cv.bar(add(knee, (12, 0)), add(knee, (12, 0)), 8)
    def front(cv):
        cv.bar(add(knee, (12, 0)), add(add(knee, (12, 0)), mul(d, SH - 8)), 7, FRAME_D, FRAME_E)
        cv.circle(roll, 11.5, (20, 20, 22)); cv.circle(roll, 10, PAD); cv.circle(roll, 4, PAD_HI)
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, None, knee),
         'Lf': leg(add(hip, (-5, -4)), ankle_f, (1, 0)), 'An': arm(sh, v(300, 160), 1)}
    return J, {'back': back, 'front_leg': front}, {'ham': 1}


# ================= etapa 3: vista de frente =================
# Figura de frente (ou de costas). Pontos em coordenadas do corpo: x lateral (+ = lado direito da tela),
# y para baixo, origem no centro da pelve. rot gira o corpo inteiro (deitada de lado = -90).
SKIN_R = (222, 210, 201)    # lado um pouco sombreado


class Front:
    def __init__(self, pelvis, rot_deg=0.0, back_view=False):
        self.P, self.r, self.back = pelvis, rot_deg, back_view
        self.legs, self.arms = {}, {}
        self.sh_y = -TO + 8

    def w(self, pt):
        return add(self.P, rot(pt, self.r))

    def leg(self, s, knee, ankle, foot=(0, 1)):
        self.legs[s] = (v(s * 14, 0), knee, ankle, foot)

    def arm(self, s, elbow, hand):
        self.arms[s] = (v(s * 27, self.sh_y), elbow, hand)

    def straight_leg(self, s, ang, bend=0):
        """Perna estendida: ang graus para fora (s positivo = afasta)."""
        hip = v(s * 14, 0)
        knee = add(hip, (s * math.sin(math.radians(ang)) * TH, math.cos(math.radians(ang)) * TH))
        a2 = ang - bend
        ankle = add(knee, (s * math.sin(math.radians(a2)) * SH, math.cos(math.radians(a2)) * SH))
        self.leg(s, knee, ankle)

    def straight_arm(self, s, ang, bend=4):
        """Braço estendido: ang graus a partir da vertical para fora (90 = horizontal)."""
        sh = v(s * 27, self.sh_y)
        el = add(sh, (s * math.sin(math.radians(ang)) * UA, math.cos(math.radians(ang)) * UA))
        a2 = ang + bend
        hand = add(el, (s * math.sin(math.radians(a2)) * FA, math.cos(math.radians(a2)) * FA))
        self.arm(s, el, hand)


def front_draw(cv, F, focus, t, hooks=None):
    hooks = hooks or {}
    W_ = F.w
    if 'back' in hooks: hooks['back'](cv)
    # pernas
    for s in (-1, 1):
        if s not in F.legs: continue
        hip, knee, ankle, foot = F.legs[s]
        skin = SKIN_N if s > 0 else SKIN_R
        cv.tapered(W_(hip), W_(knee), 14, 10, skin)
        cv.tapered(W_(knee), W_(ankle), 10, 6.5, skin)
        cv.circle(W_(knee), 9.4, skin)
        fd = rot(norm(foot), F.r)
        tip = add(W_(ankle), mul(fd, 9))
        cv.tapered(W_(ankle), tip, 7, 8, (238, 238, 240))
        cv.line(add(W_(ankle), rot((-7, 6), F.r)), add(tip, rot((7, 3), F.r)), 2.4, (60, 62, 70)) if False else None
    # shorts e tronco
    sh_l, sh_r = v(-27, F.sh_y), v(27, F.sh_y)
    torso = [v(-19, 6), v(19, 6), v(17, -44), v(28, F.sh_y + 2), v(18, F.sh_y - 6), v(-18, F.sh_y - 6), v(-28, F.sh_y + 2), v(-17, -44)]
    pts = [W_(q) for q in torso]
    cv.poly(pts, OUTLINE)
    cv.poly([W_(add(q, (0, 0))) for q in [v(-17.5, 4.5), v(17.5, 4.5), v(15.5, -43), v(26.5, F.sh_y + 3), v(17, F.sh_y - 4.5), v(-17, F.sh_y - 4.5), v(-26.5, F.sh_y + 3), v(-15.5, -43)]], TOP)
    for s in (-1, 1):
        if s in F.legs:
            hip, knee, _, _ = F.legs[s]
            cv.tapered(W_(hip), W_(add(hip, mul(sub(knee, hip), 0.38))), 15, 13.5, HIP_C, outline=None)
    cv.poly([W_(q) for q in [v(-20, -6), v(20, -6), v(21, 8), v(-21, 8)]], HIP_C)
    for s in (-1, 1):
        if s in F.legs and 'adductor' in focus:
            hip, knee, _, _ = F.legs[s]
            muscle(cv, W_(add(hip, (-s * 4, 0))), W_(knee), norm(rot((-s, 0), F.r)), 5, 6, 4.5, t * focus['adductor'], 0.3, 0.85)
    if 'abs' in focus:
        muscle(cv, W_(v(0, -10)), W_(v(0, -60)), (0, 0), 0, 9, 8, t * focus['abs'], 0, 1)
    if 'chest' in focus:
        for s in (-1, 1):
            muscle(cv, W_(v(s * 6, F.sh_y + 16)), W_(v(s * 20, F.sh_y + 12)), (0, 0), 0, 8, 7, t * focus['chest'], 0, 1)
    if 'abductor' in focus:
        for s in (-1, 1):
            muscle(cv, W_(v(s * 15, -6)), W_(v(s * 20, 12)), (0, 0), 0, 6.5, 6, t * focus['abductor'], 0, 1)
    if 'back' in focus and F.back:
        for s in (-1, 1):
            muscle(cv, W_(v(s * 10, F.sh_y + 6)), W_(v(s * 14, -40)), (0, 0), 0, 7, 5, t * focus['back'], 0, 1)
    if 'traps' in focus and F.back:
        muscle(cv, W_(v(-12, F.sh_y - 2)), W_(v(12, F.sh_y - 2)), (0, 0), 0, 6, 6, t * focus['traps'], 0, 1)
    # cabeça
    hc = W_(v(0, F.sh_y - NK - 4))
    up = rot((0, -1), F.r)
    cv.capsule(W_(v(0, F.sh_y - 6)), W_(v(0, F.sh_y - 14)), 6, SKIN_N)
    cv.circle(hc, 15.5, OUTLINE); cv.circle(hc, 14, SKIN_N)
    if F.back:
        cv.circle(hc, 14, HAIR)
        cv.capsule(add(hc, mul(up, -8)), add(hc, mul(up, -26)), 4.8, HAIR, outline=None)
    else:
        cv.circle(add(hc, mul(up, 4)), 12.8, HAIR)
        cv.circle(add(hc, mul(up, -3)), 11, SKIN_N)
    if 'mid' in hooks: hooks['mid'](cv)
    # braços
    for s in (-1, 1):
        if s not in F.arms: continue
        sh, el, hand = F.arms[s]
        skin = SKIN_N if s > 0 else SKIN_R
        cv.capsule(W_(sh), W_(el), 7.5, skin)
        cv.capsule(W_(el), W_(hand), 6.5, skin)
        cv.circle(W_(hand), 7, skin, OUTLINE, 1.6)
        if 'delt' in focus:
            muscle(cv, W_(sh), W_(el), (0, 0), 0, 9, 7, t * focus['delt'], -0.05, 0.3)
    if 'front' in hooks: hooks['front'](cv)


FX = {}
def front_exercise(id_, phase=phase_up, k=1.0, anchor=(240, FLOOR_Y), shadow=(240, 170), nofloor=False):
    def deco(fn):
        EX[id_] = dict(fn=fn, phase=phase, k=k, anchor=anchor, shadow=shadow, front=True, nofloor=nofloor)
        return fn
    return deco


STAND_P = v(240, ANK_Y - 150)


def standing_front(F=None, P=STAND_P):
    F = F or Front(P)
    for s in (-1, 1):
        F.leg(s, v(s * 16, 78), v(s * 17, 150))
    return F


def seated_front(P):
    F = Front(P)
    for s in (-1, 1):
        F.leg(s, v(s * 22, 16), v(s * 24, ANK_Y - P[1]))
    return F


def lerp3(a, b, c, t):
    return lerpv(a, b, t * 2) if t < 0.5 else lerpv(b, c, t * 2 - 1)


def seat_front(cv, P, back=True):
    cv.box(P[0] - 52, P[1] + 8, P[0] + 52, P[1] + 22, PAD, PAD_HI, 2)
    cv.bar(v(P[0], P[1] + 22), v(P[0], FLOOR_Y), 12)
    cv.bar(v(P[0] - 60, FLOOR_Y - 2), v(P[0] + 60, FLOOR_Y - 2), 8)
    if back:
        cv.box(P[0] - 38, P[1] - 120, P[0] + 38, P[1] + 2, PAD, PAD_HI, 2)


# ---------- ombros ----------
@front_exercise('elevacao-lateral', k=0.9)
def ex_lateral_raise(p):
    F = standing_front()
    a = lerp(8, 86, p)
    for s in (-1, 1): F.straight_arm(s, a, 6)
    hands = [F.w(F.arms[s][2]) for s in (-1, 1)]
    return F, {'front': lambda cv: [dumbbell_side(cv, h) for h in hands]}, {'delt': 1}


@front_exercise('elevacao-lateral-polia', k=0.9)
def ex_cable_lateral(p):
    F = standing_front(P=v(250, STAND_P[1]))
    F.straight_arm(1, lerp(-12, 84, p), 6)
    F.arm(-1, v(-50, -60), v(-82, -70))
    pul = v(130, 300)
    hand = F.w(F.arms[1][2])
    def back(cv):
        cv.bar(v(120, FLOOR_Y), v(120, 40), 11)
        cv.bar(v(100, FLOOR_Y - 2), v(150, FLOOR_Y - 2), 8)
        cv.circle(pul, 7, FRAME_C, FRAME_D, 2)
    return F, {'back': back, 'front': lambda cv: (cv.line(pul, hand, 2.5, (60, 62, 68)), cv.circle(hand, 5, METAL))}, {'delt': 1}


@front_exercise('arnold', k=0.84)
def ex_arnold(p):
    P = v(240, SEAT_HIP_Y)
    F = seated_front(P)
    for s in (-1, 1):
        el = lerp3(v(s * 12, -58), v(s * 58, -80), v(s * 38, -130), p)
        hand = lerp3(v(s * 10, -100), v(s * 58, -124), v(s * 28, -176), p)
        F.arm(s, el, hand)
    hands = [F.w(F.arms[s][2]) for s in (-1, 1)]
    return F, {'back': lambda cv: seat_front(cv, P), 'front': lambda cv: [dumbbell_side(cv, h) for h in hands]}, {'delt': 1}


@front_exercise('crucifixo-invertido', k=0.92)
def ex_reverse_fly(p):
    P = v(240, SEAT_HIP_Y)
    F = seated_front(P); F.back = True
    for s in (-1, 1):
        el = lerpv(v(s * 22, -86), v(s * 74, -88), p)
        hand = lerpv(v(s * 16, -84), v(s * 118, -86), p)
        F.arm(s, el, hand)
    def back(cv):
        cv.box(P[0] - 52, P[1] + 8, P[0] + 52, P[1] + 22, PAD, PAD_HI, 2)
        cv.bar(v(P[0], P[1] + 22), v(P[0], FLOOR_Y), 12)
        cv.bar(v(P[0] - 60, FLOOR_Y - 2), v(P[0] + 60, FLOOR_Y - 2), 8)
    hands = [F.w(F.arms[s][2]) for s in (-1, 1)]
    def front(cv):
        for h in hands:
            cv.bar(add(h, (0, -14)), add(h, (0, 14)), 6, METAL, FRAME_E)
    return F, {'back': back, 'front': front}, {'delt': 1, 'traps': 0.6, 'back': 0.4}


# ---------- peito ----------
@front_exercise('peck-deck', k=0.92)
def ex_pec_deck(p):
    P = v(240, SEAT_HIP_Y)
    F = seated_front(P)
    for s in (-1, 1):
        el = lerpv(v(s * 74, -80), v(s * 16, -80), p)
        hand = add(el, (0, -44))
        F.arm(s, el, hand)
    def back(cv):
        seat_front(cv, P)
        cv.bar(v(P[0] - 80, P[1] - 150), v(P[0] + 80, P[1] - 150), 10)
        cv.bar(v(P[0] - 80, P[1] - 150), v(P[0] - 80, FLOOR_Y), 9)
    def front(cv):
        for s in (-1, 1):
            el, hand = F.w(F.arms[s][1]), F.w(F.arms[s][2])
            c = add(mul(add(el, hand), 0.5), (0, 0))
            cv.rect_along(add(c, (s * -4, 0)), (0, 1), 30, 7, PAD, PAD_HI, 2)
            cv.line(add(c, (0, -30)), v(c[0], P[1] - 150), 3, FRAME_D)
    return F, {'back': back, 'front': front}, {'chest': 1}


@front_exercise('crossover', k=0.88)
def ex_crossover(p):
    F = standing_front()
    for s in (-1, 1):
        el = lerpv(v(s * 64, -96), v(s * 30, -48), p)
        hand = lerpv(v(s * 104, -100), v(s * -4, -14), p)
        F.arm(s, el, hand)
    tops = {s: v(240 + s * 180, 40) for s in (-1, 1)}
    hands = {s: F.w(F.arms[s][2]) for s in (-1, 1)}
    def back(cv):
        for s in (-1, 1):
            x = 240 + s * 186
            cv.bar(v(x, FLOOR_Y), v(x, 30), 11)
            cv.circle(tops[s], 7, FRAME_C, FRAME_D, 2)
        cv.bar(v(40, FLOOR_Y - 2), v(440, FLOOR_Y - 2), 8)
    def front(cv):
        for s in (-1, 1):
            cv.line(tops[s], hands[s], 2.5, (60, 62, 68)); cv.circle(hands[s], 5, METAL)
    return F, {'back': back, 'front': front}, {'chest': 1}


@front_exercise('crucifixo', k=0.95, nofloor=True)
def ex_db_fly(p):
    # vista de cima: deitada no banco, cabeça para cima na tela
    P = v(240, 196)
    F = Front(P)
    for s in (-1, 1):
        F.leg(s, v(s * 20, 70), v(s * 30, 106))
        el = lerpv(v(s * 62, -82), v(s * 30, -90), p)
        hand = lerpv(v(s * 108, -74), v(s * 10, -92), p)
        F.arm(s, el, hand)
    hands = [F.w(F.arms[s][2]) for s in (-1, 1)]
    def back(cv):
        cv.box(P[0] - 32, P[1] - 150, P[0] + 32, P[1] + 40, PAD, PAD_HI, 2)
        cv.box(P[0] - 32, P[1] + 40, P[0] + 32, P[1] + 46, FRAME_D)
    return F, {'back': back, 'front': lambda cv: [dumbbell_side(cv, h) for h in hands]}, {'chest': 1}


# ---------- adutores e abdutores ----------
def hip_machine(p, opening):
    P = v(240, SEAT_HIP_Y)
    F = Front(P)
    spread = lerp(*((60, 16) if not opening else (16, 60)), p)
    for s in (-1, 1):
        knee = v(s * spread, 30)
        F.leg(s, knee, add(knee, (s * 4, ANK_Y - P[1] - 16)))
        F.arm(s, v(s * 40, -46), v(s * 46, -6))
    def back(cv):
        seat_front(cv, P)
    def front(cv):
        for s in (-1, 1):
            k = F.w(F.legs[s][1])
            side = s if opening else -s
            c = add(k, (side * 13, 0))
            cv.rect_along(c, (0, 1), 26, 6, PAD, PAD_HI, 2)
            cv.bar(add(c, (side * 6, 26)), v(c[0] + side * 6, FLOOR_Y - 10), 6, FRAME_D, FRAME_E)
    return F, {'back': back, 'front': front}


@front_exercise('cadeira-adutora')
def ex_adductor(p):
    F, h = hip_machine(p, False)
    return F, h, {'adductor': 1}


@front_exercise('cadeira-abdutora')
def ex_abductor(p):
    F, h = hip_machine(p, True)
    return F, h, {'abductor': 1}


def cable_hip(p, adduction):
    P = v(226, STAND_P[1])
    F = standing_front(P=P)
    a = lerp(26, -12, p) if adduction else lerp(-6, 34, p)
    F.straight_leg(1, a, 2)
    F.leg(-1, v(-16, 78), v(-18, 150))
    side = 1 if adduction else -1
    col_x = 240 + side * 150
    pul = v(col_x - side * 10, 300)
    F.arm(side, v(side * 54, -62), v(side * 86, -82) if side > 0 else v(-86, -82))
    F.arm(-side, v(-side * 34, -50), v(-side * 30, -12))
    ankle = F.w(F.legs[1][2])
    def back(cv):
        cv.bar(v(col_x, FLOOR_Y), v(col_x, 40), 11)
        cv.bar(v(col_x - 24, FLOOR_Y - 2), v(col_x + 24, FLOOR_Y - 2), 8)
        cv.circle(pul, 7, FRAME_C, FRAME_D, 2)
    def front(cv):
        cv.line(pul, add(ankle, (0, -4)), 2.5, (60, 62, 68)); cv.circle(add(ankle, (0, -4)), 6, (60, 62, 68))
    return F, {'back': back, 'front': front}


@front_exercise('aducao-polia', k=0.92)
def ex_cable_adduction(p):
    F, h = cable_hip(p, True)
    return F, h, {'adductor': 1}


@front_exercise('abducao-polia', k=0.92)
def ex_cable_abduction(p):
    F, h = cable_hip(p, False)
    return F, h, {'abductor': 1}


@front_exercise('abducao-deitada')
def ex_side_lying_abduction(p):
    # deitada de lado: corpo girado (cabeça à esquerda), lado de cima = +x do corpo
    F = Front(v(226, FLOOR_Y - 22), -90)
    F.straight_leg(-1, 0)
    F.straight_leg(1, lerp(0, 40, p))
    F.arm(-1, v(-34, -128), v(-18, -150))
    F.arm(1, v(36, -44), v(24, -14))
    return F, {'back': lambda cv: cv.box(40, FLOOR_Y - 4, 420, FLOOR_Y, MAT)}, {'abductor': 1}


@front_exercise('copenhagen')
def ex_copenhagen(p):
    # prancha lateral vista de frente: antebraço no chão, perna de cima no banco
    F = Front(v(220, 246 - 14 * p), -90 + lerp(-6, 0, p))
    F.straight_leg(1, 0)
    F.straight_leg(-1, 10)
    F.arm(-1, v(-62, -92), v(-62, -132))
    F.arm(1, v(44, -60), v(30, -30))
    def back(cv):
        cv.box(40, FLOOR_Y - 4, 420, FLOOR_Y, MAT)
        top_ankle = F.w(F.legs[1][2])
        cv.box(top_ankle[0] - 30, top_ankle[1] + 12, top_ankle[0] + 50, top_ankle[1] + 26, PAD, PAD_HI, 2)
        cv.bar(v(top_ankle[0] - 18, top_ankle[1] + 26), v(top_ankle[0] - 18, FLOOR_Y), 8)
        cv.bar(v(top_ankle[0] + 38, top_ankle[1] + 26), v(top_ankle[0] + 38, FLOOR_Y), 8)
    return F, {'back': back}, {'adductor': 1, 'abs': 0.6}


@front_exercise('monster-walk', phase=lambda i: i / FRAMES, k=0.94)
def ex_monster_walk(p):
    # passo lateral: direita sai e volta; depois a esquerda (vai e volta, para o loop fechar)
    half = p < 0.5
    bump = math.sin(math.pi * ((p % 0.5) / 0.5))
    br, bl = (bump, 0) if half else (0, bump)
    shift = 10 * (br - bl)
    P = v(240 + shift, ANK_Y - 128)
    F = Front(P)
    F.leg(1, v(26, 54), v(34 + 26 * br - shift, 128 - 12 * br))
    F.leg(-1, v(-26, 54), v(-34 - 26 * bl - shift, 128 - 12 * bl))
    F.arm(1, v(30, -46), v(14, -16)); F.arm(-1, v(-30, -46), v(-14, -16))
    def front(cv):
        kr, kl = F.w(F.legs[1][1]), F.w(F.legs[-1][1])
        cv.line(add(kl, (0, 6)), add(kr, (0, 6)), 4, (230, 120, 60))
    return F, {'front': front}, {'abductor': 1}


# ---------- vista lateral restante ----------
@exercise('pallof')
def ex_pallof(p):
    ankle, knee, hip, sh = standing_body(214, 1, 6, 10)
    hand = lerpv(add(sh, (20, 20)), add(sh, (90, 14)), p)
    An = arm(sh, hand, 1)
    col = v(150, hand[1])
    def back(cv):
        cv.bar(v(150, FLOOR_Y), v(150, 40), 11)
        cv.bar(v(126, FLOOR_Y - 2), v(174, FLOOR_Y - 2), 8)
        cv.circle(col, 7, FRAME_C, FRAME_D, 2)
        cv.line(col, hand, 2.5, (60, 62, 68))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, ankle, (1, 0), knee), 'An': An, 'Af': far_of(An)}
    return J, {'back': back, 'front': lambda cv: cv.circle(hand, 5, METAL)}, {'abs': 1}


@exercise('abdominal-bicicleta', phase=lambda i: i / FRAMES)
def ex_bicycle(p):
    hip = v(250, 300)
    a = 24
    sh = add(hip, (-math.cos(math.radians(a)) * TO, -math.sin(math.radians(a)) * TO))
    nd = norm(sub(sh, hip)); ant = perp(nd)
    def legpos(ph):
        q = 0.5 - 0.5 * math.cos(2 * math.pi * ph)        # 0 estendida, 1 dobrada
        knee = add(hip, polar(lerp(-18, -104, q), TH))
        ankle = add(knee, polar(lerp(-12, 6, q), SH))
        return knee, ankle
    kn, an = legpos(p); kf, af = legpos(p + 0.5)
    headc = add(sh, mul(nd, NK))
    hand = add(add(headc, mul(ant, -12)), mul(nd, 4))
    J = {'hip': hip, 'shoulder': sh, 'Ln': leg(hip, an, None, kn, foot_rot=-40),
         'Lf': leg(add(hip, (-6, -4)), add(af, (-6, -4)), None, add(kf, (-6, -4)), foot_rot=-40),
         'An': arm(sh, hand, -1), 'head_tilt': 14}
    return J, {'back': mat}, {'abs': 0.7 + 0.3 * abs(math.sin(2 * math.pi * p))}


@exercise('kickback-smith')
def ex_smith_kickback(p):
    hip, sh = v(200, 214), v(292, 224)
    kn_f = v(204, 300)
    bar_x = 112
    ankle = v(bar_x + 6, lerp(236, 120, p))
    Ln = leg(hip, ankle, None, ik(hip, ankle, TH, SH, -1), foot_rot=-80)
    def back(cv):
        mat(cv)
        cv.bar(v(bar_x - 18, FLOOR_Y), v(bar_x - 18, 40), 10)
        cv.bar(v(bar_x - 40, 40), v(bar_x + 10, 40), 8)
    def front(cv):
        b = add(ankle, (-4, -16))
        plate_disc(cv, add(b, (-2, 0)), 20); bar_end(cv, b)
    J = {'hip': hip, 'shoulder': sh, 'Ln': Ln,
         'Lf': leg(add(hip, (-6, -4)), v(128, 304), None, kn_f, foot_rot=60),
         'An': arm(sh, v(296, 312), 1), 'head_tilt': -10}
    return J, {'back': back, 'front': front}, {'glute': 1, 'ham': 0.35}


# ---------- saída ----------
def draw_scene(e, p):
    J, hooks, focus = e['fn'](p)
    cv = Canvas(e['k'], e['anchor'])
    if not e.get('nofloor'): floor(cv, *e['shadow'])
    if e.get('front'):
        front_draw(cv, J, focus, p, hooks)
    else:
        figure(cv, J, hooks, focus, p)
    return cv.done()


def render(id_):
    e = EX[id_]
    frames = []
    for i in range(FRAMES):
        p = e['phase'](i)
        frames.append(draw_scene(e, p))
    return frames


def save(name, frames):
    os.makedirs(OUT, exist_ok=True)
    pal = frames[FRAMES // 3].quantize(colors=96, method=Image.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    path = os.path.join(OUT, name + '.gif')
    q[0].save(path, save_all=True, append_images=q[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    print(f'{name}: {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    for id_ in (sys.argv[1:] or list(EX)):
        save(id_, render(id_))

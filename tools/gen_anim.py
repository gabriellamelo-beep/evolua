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
    if 'lower' in focus:
        muscle(cv, hip, shoulder, mul(ant, -1), 9, 5.5, 4.5, t * focus['lower'], 0.15, 0.55)


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


def draw_arm(cv, A, near):
    skin = SKIN_N if near else SKIN_F
    sh, el, hand = A['sh'], A['elbow'], A['hand']
    cv.capsule(sh, el, 7.5 if near else 7, skin)
    cv.capsule(el, hand, 6.5 if near else 6, skin)
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
    draw_arm(cv, An, True)
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


@exercise('hack-squat', phase=phase_down)
def ex_hack(p):
    RD = norm((-0.5, -0.866))
    A = v(282, 293)
    hip = add(add(A, (-44, -148)), mul(RD, -78 * p))
    sh = add(hip, mul(RD, TO))
    ant = perp(RD)
    def machine(cv):
        cv.bar(v(80, FLOOR_Y), v(420, FLOOR_Y), 10)
        base = add(A, (-44, -148))
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
        cv.poly([(236, 306), (330, 290), (330, 306)], FRAME_D, FRAME_E, 2)       # plataforma inclinada
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
    J, bar = thrust_body(p, v(158, 238), v(322, ANK_Y), 36, -4)
    pivot = v(392, 176)
    def back(cv):
        bench(cv, 56, 166, 246)
        cv.bar(v(380, FLOOR_Y), pivot, 12)
        cv.bar(v(56, FLOOR_Y - 2), v(420, FLOOR_Y - 2), 8)
        cv.bar(pivot, add(pivot, mul(norm(sub(pivot, bar)), 40)), 9, FRAME_D, FRAME_E)
        plate_disc(cv, add(pivot, mul(norm(sub(pivot, bar)), 40)), 26)
    def front(cv):
        cv.bar(add(bar, (8, -4)), pivot, 9, FRAME_D, FRAME_E)
        cv.rect_along(add(bar, (0, -5)), (1, 0), 24, 8, PAD, PAD_HI, 2)
        cv.circle(pivot, 8, FRAME_C, FRAME_D, 2)
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


# ---------- saída ----------
def render(id_):
    e = EX[id_]
    frames = []
    for i in range(FRAMES):
        p = e['phase'](i)
        J, hooks, focus = e['fn'](p)
        cv = Canvas(e['k'], e['anchor'])
        floor(cv, *e['shadow'])
        figure(cv, J, hooks, focus, p)
        frames.append(cv.done())
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

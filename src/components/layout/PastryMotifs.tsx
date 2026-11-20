/**
 * Fond décoratif de la sidebar : les motifs pâtisserie de l'écran de connexion
 * (croissant, donut, muffin, baguette, cookie, part de gâteau), éparpillés avec
 * taille, position, orientation et transparence variables.
 *
 * Le tirage est pseudo-aléatoire à graine fixe : identique côté serveur et client
 * (pas d'erreur d'hydratation) et stable d'une navigation à l'autre.
 */

const GLYPHS = ['c', 'd', 'm', 'b', 'k', 'g'] as const

// Générateur déterministe (mulberry32)
function seeded(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Placement = { id: string; x: number; y: number; scale: number; rotate: number; opacity: number }

// Grille « tremblée » : une cellule sur trois environ reste vide pour laisser respirer.
function buildPlacements(seed: number): Placement[] {
    const rand = seeded(seed)
    const cols = 3
    const cellW = 88
    const cellH = 112
    const rows = 12 // couvre ~1350px de haut, au-delà des écrans tablette/desktop courants
    const out: Placement[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (rand() < 0.32) continue
            const scale = 0.75 + rand() * 1.15 // glyphe ~40u → 30 à 76px
            const size = 40 * scale
            out.push({
                id: GLYPHS[Math.floor(rand() * GLYPHS.length)],
                x: c * cellW + rand() * Math.max(4, cellW - size * 0.7) - 10,
                y: r * cellH + rand() * Math.max(4, cellH - size * 0.7) - 10,
                scale,
                rotate: Math.round(rand() * 80 - 40),
                opacity: Number((0.05 + rand() * 0.08).toFixed(3)),
            })
        }
    }
    return out
}

const PLACEMENTS = buildPlacements(20261119)

export default function PastryMotifs({ color = 'currentColor' }: { color?: string }) {
    return (
        <svg
            aria-hidden="true"
            focusable="false"
            width="100%"
            height="100%"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
        >
            <defs>
                {/* Tracés repris tels quels de src/app/(auth)/login/page.tsx */}
                <g id="pm-c">
                    <path d="M 5,20 C 5,10 15,5 30,10 C 35,12 40,17 40,22 C 38,27 30,28 20,26 C 10,24 5,22 5,20 Z" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M 12,14 C 15,10 20,10 22,13" fill="none" />
                    <path d="M 20,19 C 23,15 27,15 29,18" fill="none" />
                    <path d="M 27,23 C 29,19 32,19 34,22" fill="none" />
                </g>
                <g id="pm-d">
                    <circle cx="20" cy="20" r="17" fill="none" />
                    <circle cx="20" cy="20" r="6" fill="none" />
                    <line x1="10" y1="12" x2="13" y2="10" strokeLinecap="round" />
                    <line x1="28" y1="10" x2="29" y2="13" strokeLinecap="round" />
                    <line x1="12" y1="28" x2="15" y2="29" strokeLinecap="round" />
                    <line x1="26" y1="27" x2="29" y2="25" strokeLinecap="round" />
                    <circle cx="9" cy="20" r="0.8" fill="currentColor" />
                    <circle cx="31" cy="18" r="0.8" fill="currentColor" />
                </g>
                <g id="pm-m">
                    <path d="M 10,22 L 7,37 C 7,39 9,40 11,40 L 29,40 C 31,40 33,39 33,37 L 30,22" fill="none" strokeLinejoin="round" />
                    <line x1="15" y1="22" x2="13" y2="40" />
                    <line x1="20" y1="22" x2="20" y2="40" />
                    <line x1="25" y1="22" x2="27" y2="40" />
                    <path d="M 8,22 C 3,22 1,15 6,10 C 11,5 29,5 34,10 C 39,15 37,22 32,22 Z" fill="none" strokeLinejoin="round" />
                </g>
                <g id="pm-b">
                    <g transform="rotate(-25 20 20)">
                        <rect x="5" y="12" width="32" height="14" rx="7" fill="none" />
                        <line x1="12" y1="18" x2="17" y2="13" strokeLinecap="round" />
                        <line x1="19" y1="18" x2="24" y2="13" strokeLinecap="round" />
                        <line x1="26" y1="18" x2="31" y2="13" strokeLinecap="round" />
                    </g>
                </g>
                <g id="pm-k">
                    <circle cx="16" cy="24" r="12" fill="none" />
                    <circle cx="11" cy="20" r="1.2" fill="currentColor" />
                    <circle cx="16" cy="17" r="1" fill="currentColor" />
                    <circle cx="21" cy="22" r="1.5" fill="currentColor" />
                    <circle cx="14" cy="27" r="1.2" fill="currentColor" />
                    <path d="M 23,16 C 27,17 30,21 30,26 C 30,31 26,34 22,34" fill="none" />
                    <circle cx="26" cy="21" r="1.2" fill="currentColor" />
                    <circle cx="26" cy="28" r="1" fill="currentColor" />
                </g>
                <g id="pm-g">
                    <path d="M 5,25 L 28,14 L 33,20 L 5,31 Z" fill="none" strokeLinejoin="round" />
                    <path d="M 33,20 L 33,29 L 5,40 L 5,31" fill="none" strokeLinejoin="round" />
                    <line x1="28" y1="14" x2="28" y2="23" />
                    <line x1="5" y1="40" x2="33" y2="29" />
                    <path d="M 5,35 L 33,24" opacity="0.7" />
                    <circle cx="18" cy="12" r="2.5" fill="none" />
                    <path d="M 18,9.5 Q 20,5 23,7" fill="none" strokeLinecap="round" />
                </g>
            </defs>
            <g stroke={color} color={color} strokeWidth={2.2}>
                {PLACEMENTS.map((p, i) => (
                    <use
                        key={i}
                        href={`#pm-${p.id}`}
                        opacity={p.opacity}
                        transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rotate} ${(20 * p.scale).toFixed(1)} ${(20 * p.scale).toFixed(1)}) scale(${p.scale.toFixed(3)})`}
                    />
                ))}
            </g>
        </svg>
    )
}

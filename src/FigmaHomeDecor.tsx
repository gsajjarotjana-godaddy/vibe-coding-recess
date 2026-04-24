/**
 * Figma 891:7777 — all positions/sizes in artboard 1440×1024, expressed as
 * 100vw / 100dvh so decor stays pinned to the viewport (edges follow screen edges
 * on resize) instead of a pre-scaled centered artboard.
 */
import type { CSSProperties } from "react";

const FW = 1440;
const FH = 1024;

const xl = (x: number) => `calc(100vw * ${x} / ${FW})` as const;
const yt = (y: number) => `calc(100dvh * ${y} / ${FH})` as const;
const wv = (w: number) => `calc(100vw * ${w} / ${FW})` as const;
const hv = (h: number) => `calc(100dvh * ${h} / ${FH})` as const;

const abs = (top: number, left: number, width: number, height: number): CSSProperties => ({
  position: "absolute",
  top: yt(top),
  left: xl(left),
  width: wv(width),
  height: hv(height),
});

const flex: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const fillImg: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "fill" as const,
  maxWidth: "none",
};

/** vector-1.svg — left:-15 with 100% width left ~15px empty inside the rot box; left:0 fills the box edge-to-edge */
const vector1Img: CSSProperties = {
  position: "absolute",
  top: "-20px",
  left: 0,
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "fill" as const,
  maxWidth: "none",
  transform: "rotate(18deg)",
};

/** vector stack outer — fixed px; union-4 is positioned inside so it follows right bleed (891:7777) */
const VECTOR_OUTER_FIGMA_W = 301.779;
const VECTOR_OUTER_FIGMA_TOP = 147.99;
/* Figma x of vector-1 outer left = 1440 − W; union-4 frame x = 1263 → offset inside outer */
const UNION4_FIGMA_LEFT = 1263;
const UNION4_FIGMA_TOP = 175;
const union4OffsetX = UNION4_FIGMA_LEFT - (FW - VECTOR_OUTER_FIGMA_W);
const union4OffsetY = UNION4_FIGMA_TOP - VECTOR_OUTER_FIGMA_TOP;
/* Artboard-px sizes — no vw/vh so the icon does not grow/shrink on resize */
const UNION4_FRAME_PX = 67.352;
const UNION4_INNER_PX = 53.045;

const vectorOuterBox: CSSProperties = {
  position: "fixed",
  right: "-24px",
  left: "auto",
  top: yt(VECTOR_OUTER_FIGMA_TOP),
  width: `${VECTOR_OUTER_FIGMA_W}px`,
  height: "371.899px",
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 0,
};

const vectorGroupInner: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
};

/** 891:7862 union-4 — fixed px (no vw/vh) inside vector frame; still follows vector + right bleed */
const union4Wrap: CSSProperties = {
  position: "absolute",
  top: `${union4OffsetY}px`,
  left: `${union4OffsetX}px`,
  width: `${UNION4_FRAME_PX}px`,
  height: `${UNION4_FRAME_PX}px`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 1,
};

const vectorRotBox: CSSProperties = {
  width: "222.135px",
  height: "323.696px",
  flexShrink: 0,
  /* Pivot on right: -15.78° no longer pulls the art inward from the viewport edge */
  transform: "rotate(-15.78deg)",
  transformOrigin: "100% 50%",
  position: "relative",
  overflow: "visible",
};

/** 273×344 (Vector 2) — fixed px, no vw/vh scale (same pattern as vector-1 outer) */
const VECTOR2_FIGMA_W = 273;
const VECTOR2_FIGMA_H = 344;
const vector2Box: CSSProperties = {
  position: "fixed",
  left: "-24px",
  right: "auto",
  top: "auto",
  bottom: 0,
  width: `${VECTOR2_FIGMA_W}px`,
  height: `${VECTOR2_FIGMA_H}px`,
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 0,
};

export function FigmaHomeDecor() {
  return (
    <div className="figma-deco-root" aria-hidden="true">
      {/* vector-2.svg — bottom-left viewport edge, Figma px size (no viewport scaling) */}
      <div style={vector2Box}>
        <img
          src="/figma/vector-2.svg"
          alt=""
          style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }}
          width={273}
          height={344}
        />
      </div>
      <div className="figma-deco-artboard">
        {/* 891:7784 */}
        <div style={{ position: "absolute", top: yt(250), left: xl(267.95), width: wv(34.293), height: hv(34.293) }}>
          <img
            src="/figma/group-lime.svg"
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            width={35}
            height={35}
          />
        </div>

        <div style={abs(472, 1199, 29.117, 29.117)}>
          <img src="/figma/union-cyan.svg" alt="" style={fillImg} width={30} height={30} />
        </div>

        <div style={{ ...abs(316, 226, 26.95, 26.95), ...flex }}>
          <div
            style={{
              width: wv(19.56),
              height: hv(19.56),
              flexShrink: 0,
              transform: "rotate(-31.98deg)",
              transformOrigin: "center",
              position: "relative",
            }}
          >
            <img src="/figma/union-pink.svg" alt="" style={fillImg} width={20} height={20} />
          </div>
        </div>

        {/* frame-4.svg — Figma 34×316, no CSS rotation (orientation is in the asset) */}
        <div style={abs(659, 1265, 34, 316)}>
          <img
            src="/figma/frame-4.svg"
            alt=""
            style={fillImg}
            width={34}
            height={316}
          />
        </div>

        {/* frame-5.svg — Figma 34×157 */}
        <div style={abs(659, 1324, 34, 157)}>
          <img
            src="/figma/frame-5.svg"
            alt=""
            style={fillImg}
            width={34}
            height={157}
          />
        </div>

        <div
          style={{
            ...abs(487, -32, 141.922, 141.922),
            ...flex,
            transform: "rotate(294deg)",
            transformOrigin: "center",
          }}
        >
          <div
            style={{
              width: wv(122.539),
              height: hv(122.539),
              flexShrink: 0,
              transform: "rotate(80.02deg)",
              transformOrigin: "center",
              position: "relative",
            }}
          >
            <img src="/figma/union-large.svg" alt="" style={fillImg} width={102} height={125} />
          </div>
        </div>

        <div style={abs(439, 1130, 16, 16)}>
          <img src="/figma/ellipse-filled.svg" alt="" style={fillImg} width={16} height={16} />
        </div>

        <div style={abs(226, 134, 26, 26)}>
          <img src="/figma/ellipse-stroke.svg" alt="" style={fillImg} width={26} height={26} />
        </div>

        <div style={vectorOuterBox}>
          <div style={vectorGroupInner}>
            <div style={vectorRotBox}>
              <img src="/figma/vector-1.svg" alt="" style={vector1Img} width={222} height={324} />
            </div>
          </div>
          <div style={union4Wrap}>
            <div
              style={{
                width: `${UNION4_INNER_PX}px`,
                height: `${UNION4_INNER_PX}px`,
                flexShrink: 0,
                transform: "rotate(18.87deg)",
                transformOrigin: "center",
                position: "relative",
              }}
            >
              <img src="/figma/union-4.svg" alt="" style={fillImg} width={54} height={54} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { useLongPress } from "../hooks/useLongPress";
import { publicAsset } from "../lib/publicAsset";

export type LobbyGridMember = { id: string; name: string; r1Submitted?: boolean };

/** blue → pink → green — Figma 892:34345 */
const LOBBY_HUES = ["blue", "pink", "green"] as const;

function lobbyIconSrc(hue: (typeof LOBBY_HUES)[number]) {
  if (hue === "green") return publicAsset("figma/lightbulb.svg");
  if (hue === "blue") return publicAsset("figma/sparkles.svg");
  return publicAsset("figma/lightning-bolt.svg");
}

function buildLobbyRows(members: LobbyGridMember[]) {
  const items: { id: string; name: string }[] = members.map((m) => ({ id: m.id, name: m.name }));
  const row1 = items.slice(0, 5);
  const row2 = items.slice(5, 10);
  const rest = items.slice(10);
  const tailRows: (typeof items)[] = [];
  for (let i = 0; i < rest.length; i += 5) {
    tailRows.push(rest.slice(i, i + 5));
  }
  const n = items.length;
  const row1Stagger = n <= 5 && row1.length > 0 && row1.length % 2 === 1;
  const row2Stagger = n > 5 && n <= 10 && row2.length > 0 && row2.length % 2 === 1;
  const tailStagger = tailRows.map(
    (r, i) => i === tailRows.length - 1 && n > 10 && r.length > 0 && r.length % 2 === 1
  );
  return { row1, row2, tailRows, items, row1Stagger, row2Stagger, tailStagger };
}

type CellProps = {
  m: { id: string; name: string };
  index: number;
  isHostName: boolean;
  onHostReset: () => void;
  onHostResetEnabled: boolean;
  r1Status: "off" | "pending" | "in";
};

function LobbyPlayerCell({ m, index, isHostName, onHostReset, onHostResetEnabled, r1Status }: CellProps) {
  const hue = LOBBY_HUES[index % 3]!;
  const longPress = useLongPress(onHostReset, { enabled: onHostResetEnabled && isHostName });
  const r1Class =
    r1Status === "pending" ? " figma-lobby-cell--r1-pending" : r1Status === "in" ? " figma-lobby-cell--r1-in" : "";

  return (
    <div
      className={`figma-lobby-cell figma-lobby-cell--${hue}` + r1Class}
      style={
        {
          animationDelay: `${Math.min(index, 8) * 35}ms`,
          ...(isHostName && onHostResetEnabled
            ? { touchAction: "manipulation" as const, userSelect: "none" as const, cursor: "default" as const }
            : {}),
        }
      }
      title={isHostName && onHostResetEnabled ? "Hold to reset the room and let everyone re-enter their names" : undefined}
      {...(isHostName && onHostResetEnabled ? longPress : {})}
    >
      <div className={`figma-lobby-avatar figma-lobby-avatar--${hue}`}>
        <img src={lobbyIconSrc(hue)} width={24} height={24} className="figma-lobby-avatar__icon" alt="" />
      </div>
      <p className="figma-lobby-name">
        {m.name}
        {isHostName && (
          <span className="figma-pill figma-pill--host" style={{ marginLeft: 6, verticalAlign: "middle" }}>
            {" "}
            host
          </span>
        )}
        {r1Status === "in" && isHostName && (
          <span className="figma-pill figma-pill--small" style={{ marginLeft: 6, verticalAlign: "middle" }}>
            {" "}
            in
          </span>
        )}
      </p>
    </div>
  );
}

type Props = {
  members: LobbyGridMember[];
  hostMemberId: string | null;
  /** Omitted = no long-press reset (use in previews only). */
  onHostReset?: () => void;
  /** "lobby" = Home; "r1-wait" = prompt submitted, show who’s in / pending. */
  variant?: "lobby" | "r1-wait";
};

export function LobbyPlayerGrid({ members, hostMemberId, onHostReset, variant = "lobby" }: Props) {
  const { row1, row2, tailRows, row1Stagger, row2Stagger, tailStagger, items } = useMemo(
    () => buildLobbyRows(members),
    [members]
  );

  const onHostResetEnabled = Boolean(onHostReset);
  const hostReset = onHostReset ?? (() => {});

  const r1 = (id: string): "off" | "pending" | "in" => {
    if (variant !== "r1-wait") return "off";
    const s = members.find((x) => x.id === id);
    if (!s) return "pending";
    return s.r1Submitted ? "in" : "pending";
  };

  if (items.length === 0) return null;

  return (
    <div className="figma-lobby">
      <div
        className="figma-lobby-box"
        aria-label={variant === "r1-wait" ? "Who has submitted a prompt" : "Who joined"}
      >
        <div className="figma-lobby-group">
          <div
            className={row1Stagger ? "figma-lobby-row figma-lobby-row--r1 figma-lobby-row--stagger" : "figma-lobby-row figma-lobby-row--r1"}
          >
            {row1.map((m, i) => (
              <LobbyPlayerCell
                key={m.id}
                m={m}
                index={i}
                isHostName={Boolean(hostMemberId && m.id === hostMemberId)}
                onHostReset={hostReset}
                onHostResetEnabled={onHostResetEnabled}
                r1Status={r1(m.id)}
              />
            ))}
          </div>
          {row2.length > 0 ? (
            <div
              className={
                row2Stagger ? "figma-lobby-row figma-lobby-row--r2 figma-lobby-row--stagger" : "figma-lobby-row figma-lobby-row--r2"
              }
            >
              {row2.map((m, j) => {
                const i = 5 + j;
                return (
                  <LobbyPlayerCell
                    key={m.id}
                    m={m}
                    index={i}
                    isHostName={Boolean(hostMemberId && m.id === hostMemberId)}
                    onHostReset={hostReset}
                    onHostResetEnabled={onHostResetEnabled}
                    r1Status={r1(m.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="figma-lobby-row figma-lobby-row--r2 figma-lobby-row--placeholder" aria-hidden />
          )}
          {tailRows.map((r, ri) => {
            const start = 10 + tailRows.slice(0, ri).reduce((acc, row) => acc + row.length, 0);
            return (
              <div
                key={ri}
                className={
                  tailStagger[ri]
                    ? "figma-lobby-row figma-lobby-row--r3 figma-lobby-row--stagger"
                    : "figma-lobby-row figma-lobby-row--r3"
                }
              >
                {r.map((m, j) => {
                  const i = start + j;
                  return (
                    <LobbyPlayerCell
                      key={m.id}
                      m={m}
                      index={i}
                      isHostName={Boolean(hostMemberId && m.id === hostMemberId)}
                      onHostReset={hostReset}
                      onHostResetEnabled={onHostResetEnabled}
                      r1Status={r1(m.id)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

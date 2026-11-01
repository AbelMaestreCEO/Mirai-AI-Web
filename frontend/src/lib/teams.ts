import type { GameColor } from './game';

// Equipos del Ludo. Cada color tiene un nombre, una carpeta de personajes en
// /public/characters y la lista de retratos disponibles. A cada ficha del
// jugador se le asigna un retrato (uno por ficha), rotando la lista.
export interface Team {
  color: GameColor;
  name: string;
  /** Personaje líder del equipo: el que se muestra en la selección y en las fichas. */
  leader: string;
  folder: string;
  characters: string[];
}

export const TEAMS: Team[] = [
  {
    color: 'green',
    name: 'Clan Aberu',
    leader: 'mirai',
    folder: 'clan-aberu',
    characters: ['mirai', 'kaori', 'lorena', 'oriana'],
  },
  {
    color: 'blue',
    name: 'Armada del Norte',
    leader: 'sydney',
    folder: 'armada-del-norte',
    characters: ['sydney'],
  },
  {
    color: 'yellow',
    name: 'Reino del Cielo',
    leader: 'angelica',
    folder: 'reino-del-cielo',
    characters: ['angelica'],
  },
  {
    color: 'red',
    name: 'Reino del Infierno',
    leader: 'lucy',
    folder: 'reino-del-infierno',
    characters: ['lucy', 'katana'],
  },
];

export const TEAM_BY_COLOR: Record<GameColor, Team> = TEAMS.reduce(
  (acc, team) => {
    acc[team.color] = team;
    return acc;
  },
  {} as Record<GameColor, Team>,
);

export function teamFor(color: GameColor | null | undefined): Team | null {
  if (!color) return null;
  return TEAM_BY_COLOR[color] ?? null;
}

/**
 * Retrato exclusivo de la ficha `index`: cada ficha usa un personaje distinto
 * del equipo. Devuelve null si el equipo ya no tiene más personajes.
 */
export function characterUrl(color: GameColor | null | undefined, index = 0): string | null {
  const team = teamFor(color);
  if (!team) return null;
  const name = team.characters[index];
  if (!name) return null;
  return `/characters/${team.folder}/${name}.webp`;
}

/**
 * Número correlativo (por equipo) para las fichas sin retrato propio, p. ej.
 * un equipo con 1 personaje numera sus otras 3 fichas como 1, 2 y 3.
 */
export function characterFallbackNumber(
  color: GameColor | null | undefined,
  index = 0,
): number | null {
  const team = teamFor(color);
  if (!team || index < team.characters.length) return null;
  return index - team.characters.length + 1;
}

/** URL del líder del equipo (se usa en la selección y en cada ficha). */
export function leaderUrl(color: GameColor | null | undefined): string | null {
  const team = teamFor(color);
  if (!team) return null;
  return `/characters/${team.folder}/${team.leader}.webp`;
}

import type { GameColor } from './game';

// Equipos del Ludo. Cada color tiene un nombre, una carpeta de personajes en
// /public/characters y la lista de retratos disponibles. A cada ficha del
// jugador se le asigna un retrato (uno por ficha), rotando la lista.
export interface Team {
  color: GameColor;
  name: string;
  folder: string;
  characters: string[];
}

export const TEAMS: Team[] = [
  {
    color: 'green',
    name: 'Clan Aberu',
    folder: 'clan-aberu',
    characters: ['kaori', 'lorena', 'mirai', 'oriana'],
  },
  {
    color: 'blue',
    name: 'Armada del Norte',
    folder: 'armada-del-norte',
    characters: ['sydney'],
  },
  {
    color: 'yellow',
    name: 'Reino del Cielo',
    folder: 'reino-del-cielo',
    characters: ['angelica'],
  },
  {
    color: 'red',
    name: 'Reino del Infierno',
    folder: 'reino-del-infierno',
    characters: ['katana', 'lucy'],
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

/** URL del retrato que corresponde a la ficha `index` del color dado. */
export function characterUrl(color: GameColor | null | undefined, index = 0): string | null {
  const team = teamFor(color);
  if (!team || team.characters.length === 0) return null;
  const name = team.characters[index % team.characters.length];
  return `/characters/${team.folder}/${name}.webp`;
}

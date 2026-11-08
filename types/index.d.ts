export type Jours = { days: Record<string, number>; tokens: Record<string, number>; today: string; tz: number }
export type Limite = { kind: string; percentUsed: number; resetsAt?: string }
export type Limites = { at: number; list: Limite[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-grid': { jours: Shaped<Jours>; limites: Shaped<Limites> }
  }
}

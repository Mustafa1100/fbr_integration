// Remembers the Scenario Defaults panel (sale type, scenario id, SRO
// fields, HS code) in the browser so a repeat upload starts from whatever
// was last used instead of the hardcoded defaults every time.

import { DEFAULT_SETTINGS } from './convertCmpsale'

const STORAGE_KEY = 'convert_data_medical.settings.v1'

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing / storage full — just won't persist this session.
  }
}

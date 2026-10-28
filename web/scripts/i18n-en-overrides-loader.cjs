/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Rspack loader for `locales/en.json?overrides`. Translation keys are the
// English source text, and i18next renders a missing key as the key itself, so
// an English entry whose value equals its key changes nothing at runtime. This
// keeps only the entries that differ (about 70 of 8,000), which shrinks the
// English bundle every visitor loads, as the interface language or as the
// fallback for another one, from 0.6 MB to a few KB.

function pruneSourceText(locale) {
  const translation = {}
  for (const [key, value] of Object.entries(locale.translation)) {
    if (value !== key) translation[key] = value
  }
  return { ...locale, translation }
}

module.exports = function i18nEnOverridesLoader(source) {
  return JSON.stringify(pruneSourceText(JSON.parse(source)))
}
module.exports.pruneSourceText = pruneSourceText

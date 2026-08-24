/*
Copyright (C) 2025 QuantumNous

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

export const CHANNEL_STATUS_WINDOWS = [
  { label: '60s', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '7天', value: 604800 },
];

const FAMILY_ORDER = ['Anthropic', 'OpenAI', 'Venice AI', 'Vivgrid', '其他'];

export const formatTTFT = (milliseconds) => {
  if (!milliseconds || milliseconds <= 0) {
    return { value: '—', unit: '', text: '—' };
  }
  if (milliseconds < 1000) {
    const value = String(Math.round(milliseconds));
    return { value, unit: 'ms', text: `${value}ms` };
  }
  const value = (milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0);
  return { value, unit: 's', text: `${value}s` };
};

export const getSuccessTone = (model) => {
  if (model.request_state === 'no_requests') return 'grey';
  if (model.request_state === 'all_failed' || model.success_rate < 50) {
    return 'red';
  }
  if (model.success_rate < 80) return 'orange';
  return 'green';
};

export const getHealthColor = (health) => {
  if (health === 'good') return 'var(--semi-color-success)';
  if (health === 'warn') return 'var(--semi-color-warning)';
  if (health === 'bad') return 'var(--semi-color-danger)';
  return 'var(--semi-color-text-3)';
};

export const getVisibleErrors = (errors = []) =>
  errors.filter(
    (error) =>
      !String(error || '')
        .toLowerCase()
        .includes('quota exhausted'),
  );

export const groupChannelStatusModels = (models = []) => {
  if (models.length === 0) return [];

  const families = new Map();
  const groups = new Set();
  models.forEach((model) => {
    if (!families.has(model.family)) {
      families.set(model.family, []);
    }
    families.get(model.family).push(model);
    (model.groups || []).forEach((group) => groups.add(group));
  });

  const orderedGroups = [...groups].sort((left, right) => {
    if (left === right) return 0;
    if (left === 'default') return -1;
    if (right === 'default') return 1;
    return left.localeCompare(right);
  });

  return [
    {
      section: 'available',
      description: orderedGroups.join(' · '),
      families: [...families.entries()]
        .sort(([left], [right]) => {
          const leftIndex = FAMILY_ORDER.indexOf(left);
          const rightIndex = FAMILY_ORDER.indexOf(right);
          return (
            (leftIndex < 0 ? 999 : leftIndex) -
            (rightIndex < 0 ? 999 : rightIndex)
          );
        })
        .map(([family, familyModels]) => ({ family, models: familyModels })),
    },
  ];
};

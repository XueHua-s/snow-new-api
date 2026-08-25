import { renderQuota } from '../../../helpers';

export function formatLeaderboardCompact(value) {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatLeaderboardValue(metric, value) {
  return metric === 'quota'
    ? renderQuota(Number(value) || 0, 4)
    : `${formatLeaderboardCompact(value)} Tokens`;
}

export function formatLeaderboardAxisValue(metric, value) {
  return metric === 'quota'
    ? renderQuota(Number(value) || 0)
    : formatLeaderboardCompact(value);
}

export function formatLeaderboardBucket(period, bucket) {
  const date = new Date(bucket * 1000);
  if (period === 'day') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (period === 'year' || period === 'all') {
    return date.toLocaleDateString([], { year: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

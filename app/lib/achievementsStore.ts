import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTotalCardsCount } from './cardsStore';

export type AchievementRank = 'unearned' | 'bronze' | 'silver' | 'gold';

export interface AchievementTiers {
  bronze: number;
  silver: number;
  gold: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  conditionDescription: string;
  tiers: AchievementTiers;
  unit: string;
  icon: string;
}

export interface AchievementItem extends AchievementDefinition {
  currentValue: number;
  rank: AchievementRank;
  nextTarget: number | null;
  nextRank: AchievementRank | null;
  remainingToNext: number;
  progressPercent: number;
}

export interface AchievementStats {
  appLaunchCount: number;
  rememberedCount: number;
  notRememberedCount: number;
  sharedFolderCount: number;
  importedFolderCount: number;
  maxCardsCount: number;
  highestRanks?: Record<string, AchievementRank>;
}

const STORAGE_KEY = 'achievements_stats';

export const RANK_ORDER: Record<AchievementRank, number> = {
  unearned: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export const RANK_LABELS: Record<AchievementRank, string> = {
  unearned: '未獲得',
  bronze: '銅',
  silver: '銀',
  gold: '金',
};

export const RANK_COLORS: Record<AchievementRank, { background: string; text: string; border: string }> = {
  unearned: { background: '#9E9E9E20', text: '#757575', border: '#9E9E9E' },
  bronze: { background: '#CD7F3220', text: '#B87333', border: '#CD7F32' },
  silver: { background: '#78909C20', text: '#546E7A', border: '#78909C' },
  gold: { background: '#FFD70025', text: '#C68A00', border: '#FFC107' },
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'app_launches',
    title: '起動明王',
    description: 'アプリの累計起動回数',
    conditionDescription: 'アプリを累計20回起動した / 100回起動した / 500回起動した',
    tiers: { bronze: 20, silver: 100, gold: 500 },
    unit: '回',
    icon: 'flame-outline',
  },
  {
    id: 'correct_answers',
    title: '正解マスター',
    description: '暗記テストで「暗記した」ボタンを押した回数',
    conditionDescription: '暗記テストで暗記したボタンを累計10回押した / 1000回押した / 10000回押した',
    tiers: { bronze: 10, silver: 1000, gold: 10000 },
    unit: '回',
    icon: 'checkmark-circle-outline',
  },
  {
    id: 'incorrect_answers',
    title: '不正解マスター',
    description: '暗記テストで「暗記してない」ボタンを押した回数',
    conditionDescription: '暗記テストで暗記してないボタンを累計10回押した / 500回押した / 5000回押した',
    tiers: { bronze: 10, silver: 500, gold: 5000 },
    unit: '回',
    icon: 'close-circle-outline',
  },
  {
    id: 'total_cards',
    title: '冬眠用カード',
    description: 'アプリ内の合計カード枚数',
    conditionDescription: 'アプリ内のカードが合計50枚 / 500枚 / 5000枚',
    tiers: { bronze: 50, silver: 500, gold: 5000 },
    unit: '枚',
    icon: 'layers-outline',
  },
  {
    id: 'folder_shares',
    title: 'プロプロバイダ',
    description: 'フォルダを共有した回数',
    conditionDescription: 'フォルダを共有した回数が累計1回 / 5回 / 10回',
    tiers: { bronze: 1, silver: 5, gold: 10 },
    unit: '回',
    icon: 'share-social-outline',
  },
  {
    id: 'folder_imports',
    title: '貪欲学習',
    description: '共有フォルダを取り込んだ回数',
    conditionDescription: '共有フォルダを取り込んだ回数が累計1回 / 5回 / 20回',
    tiers: { bronze: 1, silver: 5, gold: 20 },
    unit: '回',
    icon: 'cloud-download-outline',
  },
];

const initialStats: AchievementStats = {
  appLaunchCount: 0,
  rememberedCount: 0,
  notRememberedCount: 0,
  sharedFolderCount: 0,
  importedFolderCount: 0,
  maxCardsCount: 0,
  highestRanks: {},
};

let cachedStats: AchievementStats | null = null;
let hasRecordedLaunchThisSession = false;

export async function getAchievementStats(): Promise<AchievementStats> {
  if (cachedStats) return cachedStats;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedStats = { ...initialStats, ...JSON.parse(raw) };
    } else {
      cachedStats = { ...initialStats };
    }
  } catch (e) {
    console.error('Failed to load achievement stats:', e);
    cachedStats = { ...initialStats };
  }
  return cachedStats!;
}

async function saveAchievementStats(stats: AchievementStats): Promise<void> {
  cachedStats = stats;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save achievement stats:', e);
  }
}

export function computeRank(
  value: number,
  tiers: AchievementTiers,
  savedHighest?: AchievementRank
): AchievementRank {
  let calculated: AchievementRank = 'unearned';
  if (value >= tiers.gold) {
    calculated = 'gold';
  } else if (value >= tiers.silver) {
    calculated = 'silver';
  } else if (value >= tiers.bronze) {
    calculated = 'bronze';
  }

  if (savedHighest && RANK_ORDER[savedHighest] > RANK_ORDER[calculated]) {
    return savedHighest;
  }
  return calculated;
}

/**
 * アプリ起動回数をインクリメント（1セッションで1回のみカウント）
 */
export async function recordAppLaunch(): Promise<void> {
  if (hasRecordedLaunchThisSession) return;
  hasRecordedLaunchThisSession = true;
  const stats = await getAchievementStats();
  stats.appLaunchCount = (stats.appLaunchCount || 0) + 1;
  await saveAchievementStats(stats);
}

/**
 * 暗記テストで「暗記した」ボタンを押した回数を記録
 */
export async function recordRemembered(): Promise<void> {
  const stats = await getAchievementStats();
  stats.rememberedCount = (stats.rememberedCount || 0) + 1;
  await saveAchievementStats(stats);
}

/**
 * 暗記テストで「暗記してない」ボタンを押した回数を記録
 */
export async function recordNotRemembered(): Promise<void> {
  const stats = await getAchievementStats();
  stats.notRememberedCount = (stats.notRememberedCount || 0) + 1;
  await saveAchievementStats(stats);
}

/**
 * フォルダ共有回数を記録
 */
export async function recordFolderShare(): Promise<void> {
  const stats = await getAchievementStats();
  stats.sharedFolderCount = (stats.sharedFolderCount || 0) + 1;
  await saveAchievementStats(stats);
}

/**
 * 共有フォルダ取り込み回数を記録
 */
export async function recordFolderImport(): Promise<void> {
  const stats = await getAchievementStats();
  stats.importedFolderCount = (stats.importedFolderCount || 0) + 1;
  await saveAchievementStats(stats);
}

/**
 * 全実績の現在のステータスを計算して返す
 */
export async function getAchievementsList(): Promise<AchievementItem[]> {
  const stats = await getAchievementStats();
  const currentTotalCards = getTotalCardsCount();

  // カード枚数の最大値を更新
  if (currentTotalCards > (stats.maxCardsCount || 0)) {
    stats.maxCardsCount = currentTotalCards;
    await saveAchievementStats(stats);
  }

  const highestRanks = { ...(stats.highestRanks || {}) };
  let ranksChanged = false;

  const items: AchievementItem[] = ACHIEVEMENT_DEFINITIONS.map(def => {
    let currentValue = 0;
    switch (def.id) {
      case 'app_launches':
        currentValue = stats.appLaunchCount || 0;
        break;
      case 'correct_answers':
        currentValue = stats.rememberedCount || 0;
        break;
      case 'incorrect_answers':
        currentValue = stats.notRememberedCount || 0;
        break;
      case 'total_cards':
        currentValue = currentTotalCards;
        break;
      case 'folder_shares':
        currentValue = stats.sharedFolderCount || 0;
        break;
      case 'folder_imports':
        currentValue = stats.importedFolderCount || 0;
        break;
    }

    const savedHighest = highestRanks[def.id];
    // 冬眠用カードの場合は過去の最大枚数も考慮
    const effectiveValue = def.id === 'total_cards' ? Math.max(currentValue, stats.maxCardsCount || 0) : currentValue;
    const rank = computeRank(effectiveValue, def.tiers, savedHighest);

    if (!savedHighest || RANK_ORDER[rank] > RANK_ORDER[savedHighest]) {
      highestRanks[def.id] = rank;
      ranksChanged = true;
    }

    let nextTarget: number | null = null;
    let nextRank: AchievementRank | null = null;
    let prevThreshold = 0;

    if (rank === 'unearned') {
      nextTarget = def.tiers.bronze;
      nextRank = 'bronze';
      prevThreshold = 0;
    } else if (rank === 'bronze') {
      nextTarget = def.tiers.silver;
      nextRank = 'silver';
      prevThreshold = def.tiers.bronze;
    } else if (rank === 'silver') {
      nextTarget = def.tiers.gold;
      nextRank = 'gold';
      prevThreshold = def.tiers.silver;
    } else {
      nextTarget = null;
      nextRank = null;
      prevThreshold = def.tiers.gold;
    }

    let progressPercent = 0;
    let remainingToNext = 0;
    if (nextTarget !== null) {
      const needed = nextTarget - prevThreshold;
      const done = Math.max(0, currentValue - prevThreshold);
      progressPercent = Math.min(100, Math.max(0, Math.round((done / needed) * 100)));
      remainingToNext = Math.max(0, nextTarget - currentValue);
    } else {
      progressPercent = 100;
      remainingToNext = 0;
    }

    return {
      ...def,
      currentValue,
      rank,
      nextTarget,
      nextRank,
      remainingToNext,
      progressPercent,
    };
  });

  if (ranksChanged) {
    stats.highestRanks = highestRanks;
    await saveAchievementStats(stats);
  }

  return items;
}

/**
 * 実績データをリセット
 */
export async function resetAchievementsData(): Promise<void> {
  cachedStats = { ...initialStats };
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to reset achievements data:', e);
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateFolderCardSettings } from './cardsStore';

export type UserGoal = {
  id: string;
  folderPath: string[]; // [] は全フォルダ
  folderName: string;   // 表示名
  targetDate: string;   // YYYY-MM-DD
  objRememberTime: number; // 目標記憶日数 (日)
  objStability: number;   // 目標記憶安定性
  createdAt: string;
};

const GOALS_STORAGE_KEY = 'user_goals_data';

export async function getGoals(): Promise<UserGoal[]> {
  try {
    const json = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    if (!json) {
      // 初回起動時のデフォルト目標
      const defaultGoalDate = new Date();
      defaultGoalDate.setDate(defaultGoalDate.getDate() + 14);
      const yyyy = defaultGoalDate.getFullYear();
      const mm = String(defaultGoalDate.getMonth() + 1).padStart(2, '0');
      const dd = String(defaultGoalDate.getDate()).padStart(2, '0');
      const defaultTargetDateStr = `${yyyy}-${mm}-${dd}`;

      const defaultGoals: UserGoal[] = [
        {
          id: 'default_monitor_goal',
          folderPath: ['モニター用単語'],
          folderName: 'モニター用単語',
          targetDate: defaultTargetDateStr,
          objRememberTime: 14,
          objStability: 133,
          createdAt: new Date().toISOString(),
        },
      ];

      await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(defaultGoals));
      updateFolderCardSettings(['モニター用単語'], 14, 133);
      return defaultGoals;
    }
    return JSON.parse(json) as UserGoal[];
  } catch (e) {
    console.error('Failed to load goals:', e);
    return [];
  }
}

export async function saveGoal(input: {
  folderPath: string[];
  folderName: string;
  targetDate: string;
  objRememberTime: number;
  objStability: number;
}): Promise<UserGoal[]> {
  try {
    const currentGoals = await getGoals();
    
    // 同じ folderPath の目標が既にあれば更新、無ければ追加
    const pathKey = JSON.stringify(input.folderPath);
    const existingIndex = currentGoals.findIndex(g => JSON.stringify(g.folderPath) === pathKey);

    const newGoal: UserGoal = {
      id: existingIndex >= 0 ? currentGoals[existingIndex].id : 'goal_' + Date.now(),
      folderPath: input.folderPath,
      folderName: input.folderName,
      targetDate: input.targetDate,
      objRememberTime: input.objRememberTime,
      objStability: input.objStability,
      createdAt: new Date().toISOString(),
    };

    let updatedList: UserGoal[];
    if (existingIndex >= 0) {
      updatedList = [...currentGoals];
      updatedList[existingIndex] = newGoal;
    } else {
      updatedList = [...currentGoals, newGoal];
    }

    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(updatedList));

    // カードの数理モデルパラメータに一括反映
    updateFolderCardSettings(input.folderPath, input.objRememberTime, input.objStability);

    return updatedList;
  } catch (e) {
    console.error('Failed to save goal:', e);
    return [];
  }
}

export async function deleteGoal(id: string): Promise<UserGoal[]> {
  try {
    const currentGoals = await getGoals();
    const target = currentGoals.find(g => g.id === id);
    if (target && (target.folderName === 'モニター用単語' || target.folderPath.includes('モニター用単語') || target.id === 'default_monitor_goal')) {
      return currentGoals;
    }
    const updatedList = currentGoals.filter(g => g.id !== id);
    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(updatedList));
    return updatedList;
  } catch (e) {
    console.error('Failed to delete goal:', e);
    return [];
  }
}

export async function resetGoalsData(): Promise<UserGoal[]> {
  try {
    const currentGoals = await getGoals();
    const monitorGoals = currentGoals.filter(
      g => g.folderName === 'モニター用単語' || g.folderPath.includes('モニター用単語') || g.id === 'default_monitor_goal'
    );

    let resetGoals: UserGoal[];
    if (monitorGoals.length > 0) {
      resetGoals = monitorGoals;
    } else {
      const defaultGoalDate = new Date();
      defaultGoalDate.setDate(defaultGoalDate.getDate() + 14);
      const yyyy = defaultGoalDate.getFullYear();
      const mm = String(defaultGoalDate.getMonth() + 1).padStart(2, '0');
      const dd = String(defaultGoalDate.getDate()).padStart(2, '0');
      const defaultTargetDateStr = `${yyyy}-${mm}-${dd}`;

      resetGoals = [
        {
          id: 'default_monitor_goal',
          folderPath: ['モニター用単語'],
          folderName: 'モニター用単語',
          targetDate: defaultTargetDateStr,
          objRememberTime: 14,
          objStability: 133,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(resetGoals));
    return resetGoals;
  } catch (e) {
    console.error('Failed to reset goals:', e);
    return [];
  }
}
